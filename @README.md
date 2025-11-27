# Gravity Forms → Zoho CRM (Option B) Flow

This document captures the steps we will follow to push Gravity Forms submissions directly into Zoho CRM Leads via the Gravity Forms Webhooks Add-On. The goal is to keep the integration inside our WordPress stack (no middleware) while handling OAuth safely and keeping the payload flexible for new fields.

---

## 1. Architecture at a Glance
1. Visitor submits the Gravity Form.
2. Gravity Webhooks Add-On POSTs the submission payload to `https://www.zohoapis.{region}/crm/v2/Leads`.
3. A lightweight WordPress helper keeps a valid Zoho OAuth access token and injects it into the webhook headers.
4. Zoho CRM creates the Lead immediately; any follow-up workflows (assignment rules, Lead Forms, etc.) continue to run inside Zoho.

---

## 2. Prerequisites
- WordPress site running Gravity Forms and the official Webhooks Add-On (Elite license required).
- Zoho CRM account with API access in the correct region (US `.com`, EU `.eu`, IN `.in`, AU `.com.au`, CA `.ca`).
- Zoho API Console client (Server-based or Self Client) with:
  - `client_id`, `client_secret`
  - `redirect_uri` (for authorization code exchange)
  - Long-lived `refresh_token`
- Secure place to store secrets in WordPress (preferably `wp-config.php` constants or environment variables).
- Ability to install a small custom plugin/snippet inside the WordPress instance.

---

## 3. Obtain and Persist Zoho OAuth Tokens
1. Go to https://api-console.zoho.com/ → `Add Client` → `Server-based`.
2. Note the generated `client_id` and `client_secret`.
3. Authorize once (self-client or standard OAuth flow) to capture:
   - `access_token` (expires in ~1 hour)
   - `refresh_token` (long lived; store securely)
4. Save the tokens and credentials in WordPress (constants or options). Example `wp-config.php` entries:
   ```php
   define('ZOHO_CLIENT_ID',     '1000.xxxxx');
   define('ZOHO_CLIENT_SECRET', 'xxxxxx');
   define('ZOHO_REFRESH_TOKEN', '1000.xxxxx');
   define('ZOHO_DC',            'com'); // eu, in, com.au, ca, etc.
   ```

---

## 4. WordPress Helper Plugin (Token Refresh + Header Injection)
Create `wp-content/plugins/gravity-zoho-bridge/gravity-zoho-bridge.php` with the snippet below. It refreshes the access token when needed and ensures every Gravity webhook bound to Zoho carries the correct `Authorization` header.

```php
<?php
/**
 * Plugin Name: Gravity → Zoho CRM Bridge
 */

const GF_ZOHO_OPTION = 'gf_zoho_tokens';

function gf_zoho_get_tokens(): array {
    return get_option(GF_ZOHO_OPTION, [
        'access_token'  => '',
        'expires_at'    => 0,
    ]);
}

function gf_zoho_store_tokens(array $tokens): void {
    update_option(GF_ZOHO_OPTION, $tokens, false);
}

function gf_zoho_refresh_access_token(): string {
    $tokens = gf_zoho_get_tokens();
    if ($tokens['expires_at'] > time() + 60 && !empty($tokens['access_token'])) {
        return $tokens['access_token'];
    }

    $response = wp_remote_post("https://accounts.zoho." . ZOHO_DC . "/oauth/v2/token", [
        'body' => [
            'refresh_token' => ZOHO_REFRESH_TOKEN,
            'client_id'     => ZOHO_CLIENT_ID,
            'client_secret' => ZOHO_CLIENT_SECRET,
            'grant_type'    => 'refresh_token',
        ],
        'timeout' => 15,
    ]);

    if (is_wp_error($response)) {
        throw new RuntimeException($response->get_error_message());
    }

    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if (empty($payload['access_token'])) {
        throw new RuntimeException('Zoho refresh failed: ' . wp_remote_retrieve_body($response));
    }

    $tokens['access_token'] = $payload['access_token'];
    $tokens['expires_at']   = time() + (int) ($payload['expires_in'] ?? 3600);
    gf_zoho_store_tokens($tokens);

    return $tokens['access_token'];
}

add_filter('gform_webhooks_request_headers', function ($headers, $feed) {
    // Only target feeds that point to Zoho CRM Leads.
    $url = rtrim($feed['meta']['requestURL'] ?? '', '/');
    if (!str_contains($url, 'zohoapis')) {
        return $headers;
    }

    try {
        $token = gf_zoho_refresh_access_token();
        $headers['Authorization'] = 'Zoho-oauthtoken ' . $token;
    } catch (Throwable $e) {
        error_log('[GF→Zoho] Token error: ' . $e->getMessage());
    }

    $headers['Content-Type'] = 'application/json';
    return $headers;
}, 10, 2);
```

> Optional: hook into `gform_webhooks_request_data` if you need to reshape the payload (e.g., enforce defaults, trim values, add metadata).

---

## 5. Configure the Gravity Forms Webhook Feed
1. **Form Settings → Webhooks → Add New Feed.**
2. **Request URL**: `https://www.zohoapis.{region}/crm/v2/Leads`
3. **Request Method**: `POST`
4. **Request Format**: `JSON (raw)`
5. **Request Body**: use merge tags to map fields:
   ```json
   {
     "data": [
       {
         "Company": "{Company:7}",
         "Last_Name": "{Last Name (Required):2}",
         "First_Name": "{First Name:1}",
         "Email": "{Email:3}",
         "Phone": "{Phone:4}",
         "Lead_Source": "Website - Gravity Form",
         "Description": "Submitted via Gravity Form: {Message:6}"
       }
     ]
   }
   ```
6. Leave headers empty in the UI—the plugin filter injects `Authorization` at runtime.
7. Enable logging inside Gravity Forms (`Forms → Settings → Logging`) to capture request/response pairs during QA.

---

## 6. Testing & Verification
1. Submit the form in staging (use different leads to avoid duplicates).
2. Monitor `Forms → Settings → Logging → Webhooks` for a `200` response and inspect the response body from Zoho (should show the created record ID).
3. Validate inside Zoho CRM under `Leads`:
   - Record exists with mapped fields.
   - Assignment rules, workflows, or blueprints triggered as expected.
4. For manual tests or debugging, run:
   ```bash
   curl -X POST "https://www.zohoapis.{region}/crm/v2/Leads" \
     -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{ "data": [ { "Company": "ACME Ltd", "Last_Name": "Doe", "First_Name": "John", "Email": "john.doe@example.com" } ] }'
   ```

---

## 7. Error Handling & Observability
- The plugin logs token refresh failures to `error_log`; set up `WP_DEBUG_LOG` in staging to capture them.
- Gravity Forms logging captures Zoho’s response payload—use it to surface validation errors (missing required lead fields, bad picklist values, etc.).
- Consider adding a fallback notification (e.g., WP Mail or Slack) if the webhook returns non-2xx for a sustained period.

---

## 8. Extending the Flow
- **Attachments**: Upload to Zoho Files first, then include the `attachments` array in a follow-up API call.
- **Custom modules**: Change the Request URL to `.../crm/v2/<Module_Name>` and adjust the JSON fields.
- **Lead Forms module**: Keep sending into `Leads`, then configure a Zoho workflow or Deluge function to map the data into the Lead Forms module to preserve historical submissions.
- **Rate limits**: Zoho CRM allows ~1000 API calls/day per user license; consolidate forms or throttle if traffic is high.

---

## 9. Rollout Checklist
- [ ] Refresh token stored securely and documented.
- [ ] Helper plugin deployed to staging and production.
- [ ] Webhook feed enabled with correct field mapping on each relevant Gravity Form.
- [ ] Logging enabled and reviewed after initial submissions.
- [ ] Zoho Lead view updated with any new fields introduced by the form.
- [ ] Monitoring/alerting in place for failures.

Once all boxes are checked, switch the production form to point at the live webhook feed and monitor Zoho for the first few submissions to validate the flow end-to-end.
