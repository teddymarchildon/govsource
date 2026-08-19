## checkout.session.completed

{
  "object": {
    "id": "cs_live_a1obCyPmEmCUjKcctwVlxn6NtSWtUVSrc0HWzOl6X5y9rARjwU5EnEY4U5",
    "object": "checkout.session",
    "adaptive_pricing": null,
    "after_expiration": null,
    "allow_promotion_codes": null,
    "amount_subtotal": 499,
    "amount_total": 499,
    "automatic_tax": {
      "enabled": false,
      "liability": null,
      "provider": null,
      "status": null
    },
    "billing_address_collection": null,
    "cancel_url": "https://www.govsrc.com/bills/2674",
    "client_reference_id": "e47c99bd-5b8c-4b19-bf56-32142517e37e",
    "client_secret": null,
    "collected_information": {
      "shipping_details": null
    },
    "consent": null,
    "consent_collection": null,
    "created": 1750384319,
    "currency": "usd",
    "currency_conversion": null,
    "custom_fields": [],
    "custom_text": {
      "after_submit": null,
      "shipping_address": null,
      "submit": null,
      "terms_of_service_acceptance": null
    },
    "customer": "cus_SWy3sIVVDOYA6N",
    "customer_creation": "always",
    "customer_details": {
      "address": {
        "city": null,
        "country": "US",
        "line1": null,
        "line2": null,
        "postal_code": "10011",
        "state": null
      },
      "email": "leah.delaney.stewart@gmail.com",
      "name": "Leah Stewart",
      "phone": null,
      "tax_exempt": "none",
      "tax_ids": []
    },
    "customer_email": null,
    "discounts": [],
    "expires_at": 1750470719,
    "invoice": "in_1Rbu7tFHp5a6uQihgQp54tYf",
    "invoice_creation": null,
    "livemode": true,
    "locale": null,
    "metadata": {},
    "mode": "subscription",
    "payment_intent": null,
    "payment_link": null,
    "payment_method_collection": "always",
    "payment_method_configuration_details": {
      "id": "pmc_1RKhKXFHp5a6uQihWp87FR3z",
      "parent": null
    },
    "payment_method_options": {
      "card": {
        "request_three_d_secure": "automatic"
      }
    },
    "payment_method_types": [
      "card",
      "link",
      "cashapp",
      "amazon_pay"
    ],
    "payment_status": "paid",
    "permissions": null,
    "phone_number_collection": {
      "enabled": false
    },
    "recovered_from": null,
    "saved_payment_method_options": {
      "allow_redisplay_filters": [
        "always"
      ],
      "payment_method_remove": "disabled",
      "payment_method_save": null
    },
    "setup_intent": null,
    "shipping_address_collection": null,
    "shipping_cost": null,
    "shipping_options": [],
    "status": "complete",
    "submit_type": null,
    "subscription": "sub_1Rbu7tFHp5a6uQihClPjLcC6",
    "success_url": "https://www.govsrc.com/bills/2674",
    "total_details": {
      "amount_discount": 0,
      "amount_shipping": 0,
      "amount_tax": 0
    },
    "ui_mode": "hosted",
    "url": null,
    "wallet_options": null
  },
  "previous_attributes": null
}


## customer.subscription.created

{
  "object": {
    "id": "sub_1Rbu7tFHp5a6uQihClPjLcC6",
    "object": "subscription",
    "application": null,
    "application_fee_percent": null,
    "automatic_tax": {
      "disabled_reason": null,
      "enabled": false,
      "liability": null
    },
    "billing_cycle_anchor": 1750384339,
    "billing_cycle_anchor_config": null,
    "billing_mode": {
      "type": "classic"
    },
    "billing_thresholds": null,
    "cancel_at": null,
    "cancel_at_period_end": false,
    "canceled_at": null,
    "cancellation_details": {
      "comment": null,
      "feedback": null,
      "reason": null
    },
    "collection_method": "charge_automatically",
    "created": 1750384339,
    "currency": "usd",
    "customer": "cus_SWy3sIVVDOYA6N",
    "days_until_due": null,
    "default_payment_method": "pm_1Rbu7qFHp5a6uQihHROH4BP3",
    "default_source": null,
    "default_tax_rates": [],
    "description": null,
    "discounts": [],
    "ended_at": null,
    "invoice_settings": {
      "account_tax_ids": null,
      "issuer": {
        "type": "self"
      }
    },
    "items": {
      "object": "list",
      "data": [
        {
          "id": "si_SWy4Mdj6eRE3WA",
          "object": "subscription_item",
          "billing_thresholds": null,
          "created": 1750384339,
          "current_period_end": 1752976339,
          "current_period_start": 1750384339,
          "discounts": [],
          "metadata": {},
          "plan": {
            "id": "price_1RXqViFHp5a6uQihQFgBJKBH",
            "object": "plan",
            "active": true,
            "amount": 499,
            "amount_decimal": "499",
            "billing_scheme": "per_unit",
            "created": 1749417130,
            "currency": "usd",
            "interval": "month",
            "interval_count": 1,
            "livemode": true,
            "metadata": {},
            "meter": null,
            "nickname": null,
            "product": "prod_SSm3l4wMOMeAZA",
            "tiers_mode": null,
            "transform_usage": null,
            "trial_period_days": null,
            "usage_type": "licensed"
          },
          "price": {
            "id": "price_1RXqViFHp5a6uQihQFgBJKBH",
            "object": "price",
            "active": true,
            "billing_scheme": "per_unit",
            "created": 1749417130,
            "currency": "usd",
            "custom_unit_amount": null,
            "livemode": true,
            "lookup_key": null,
            "metadata": {},
            "nickname": null,
            "product": "prod_SSm3l4wMOMeAZA",
            "recurring": {
              "interval": "month",
              "interval_count": 1,
              "meter": null,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "tax_behavior": "unspecified",
            "tiers_mode": null,
            "transform_quantity": null,
            "type": "recurring",
            "unit_amount": 499,
            "unit_amount_decimal": "499"
          },
          "quantity": 1,
          "subscription": "sub_1Rbu7tFHp5a6uQihClPjLcC6",
          "tax_rates": []
        }
      ],
      "has_more": false,
      "total_count": 1,
      "url": "/v1/subscription_items?subscription=sub_1Rbu7tFHp5a6uQihClPjLcC6"
    },
    "latest_invoice": "in_1Rbu7tFHp5a6uQihgQp54tYf",
    "livemode": true,
    "metadata": {},
    "next_pending_invoice_item_invoice": null,
    "on_behalf_of": null,
    "pause_collection": null,
    "payment_settings": {
      "payment_method_options": {
        "acss_debit": null,
        "bancontact": null,
        "card": {
          "network": null,
          "request_three_d_secure": "automatic"
        },
        "customer_balance": null,
        "konbini": null,
        "sepa_debit": null,
        "us_bank_account": null
      },
      "payment_method_types": null,
      "save_default_payment_method": "off"
    },
    "pending_invoice_item_interval": null,
    "pending_setup_intent": null,
    "pending_update": null,
    "plan": {
      "id": "price_1RXqViFHp5a6uQihQFgBJKBH",
      "object": "plan",
      "active": true,
      "amount": 499,
      "amount_decimal": "499",
      "billing_scheme": "per_unit",
      "created": 1749417130,
      "currency": "usd",
      "interval": "month",
      "interval_count": 1,
      "livemode": true,
      "metadata": {},
      "meter": null,
      "nickname": null,
      "product": "prod_SSm3l4wMOMeAZA",
      "tiers_mode": null,
      "transform_usage": null,
      "trial_period_days": null,
      "usage_type": "licensed"
    },
    "quantity": 1,
    "schedule": null,
    "start_date": 1750384339,
    "status": "active",
    "test_clock": null,
    "transfer_data": null,
    "trial_end": null,
    "trial_settings": {
      "end_behavior": {
        "missing_payment_method": "create_invoice"
      }
    },
    "trial_start": null
  },
  "previous_attributes": null
}

## invoice.payment_succeeded

{
  "object": {
    "id": "in_1Rbu7tFHp5a6uQihgQp54tYf",
    "object": "invoice",
    "account_country": "US",
    "account_name": "Theodore Marchildon",
    "account_tax_ids": null,
    "amount_due": 499,
    "amount_overpaid": 0,
    "amount_paid": 499,
    "amount_remaining": 0,
    "amount_shipping": 0,
    "application": null,
    "attempt_count": 0,
    "attempted": true,
    "auto_advance": false,
    "automatic_tax": {
      "disabled_reason": null,
      "enabled": false,
      "liability": null,
      "provider": null,
      "status": null
    },
    "automatically_finalizes_at": null,
    "billing_reason": "subscription_create",
    "collection_method": "charge_automatically",
    "created": 1750384339,
    "currency": "usd",
    "custom_fields": null,
    "customer": "cus_SWy3sIVVDOYA6N",
    "customer_address": {
      "city": null,
      "country": "US",
      "line1": null,
      "line2": null,
      "postal_code": "10011",
      "state": null
    },
    "customer_email": "leah.delaney.stewart@gmail.com",
    "customer_name": "Leah Stewart",
    "customer_phone": null,
    "customer_shipping": null,
    "customer_tax_exempt": "none",
    "customer_tax_ids": [],
    "default_payment_method": null,
    "default_source": null,
    "default_tax_rates": [],
    "description": null,
    "discounts": [],
    "due_date": null,
    "effective_at": 1750384339,
    "ending_balance": 0,
    "footer": null,
    "from_invoice": null,
    "hosted_invoice_url": "https://invoice.stripe.com/i/acct_1RKhK0FHp5a6uQih/live_YWNjdF8xUktoSzBGSHA1YTZ1UWloLF9TV3k0RUhlQTRYS1VXalF1dmdBejNvR09RM2dleXhVLDE0MDkyNTE0Mw0200h47TMKYl?s=ap",
    "invoice_pdf": "https://pay.stripe.com/invoice/acct_1RKhK0FHp5a6uQih/live_YWNjdF8xUktoSzBGSHA1YTZ1UWloLF9TV3k0RUhlQTRYS1VXalF1dmdBejNvR09RM2dleXhVLDE0MDkyNTE0Mw0200h47TMKYl/pdf?s=ap",
    "issuer": {
      "type": "self"
    },
    "last_finalization_error": null,
    "latest_revision": null,
    "lines": {
      "object": "list",
      "data": [
        {
          "id": "il_1Rbu7rFHp5a6uQihBqecnf3p",
          "object": "line_item",
          "amount": 499,
          "currency": "usd",
          "description": "1 × GovSource Monthly Subscription (at $1.99 / month)",
          "discount_amounts": [],
          "discountable": true,
          "discounts": [],
          "invoice": "in_1Rbu7tFHp5a6uQihgQp54tYf",
          "livemode": true,
          "metadata": {},
          "parent": {
            "invoice_item_details": null,
            "subscription_item_details": {
              "invoice_item": null,
              "proration": false,
              "proration_details": {
                "credited_items": null
              },
              "subscription": "sub_1Rbu7tFHp5a6uQihClPjLcC6",
              "subscription_item": "si_SWy4Mdj6eRE3WA"
            },
            "type": "subscription_item_details"
          },
          "period": {
            "end": 1752976339,
            "start": 1750384339
          },
          "pretax_credit_amounts": [],
          "pricing": {
            "price_details": {
              "price": "price_1RXqViFHp5a6uQihQFgBJKBH",
              "product": "prod_SSm3l4wMOMeAZA"
            },
            "type": "price_details",
            "unit_amount_decimal": "499"
          },
          "quantity": 1,
          "taxes": []
        }
      ],
      "has_more": false,
      "total_count": 1,
      "url": "/v1/invoices/in_1Rbu7tFHp5a6uQihgQp54tYf/lines"
    },
    "livemode": true,
    "metadata": {},
    "next_payment_attempt": null,
    "number": "NGCUJA3V-0001",
    "on_behalf_of": null,
    "parent": {
      "quote_details": null,
      "subscription_details": {
        "metadata": {},
        "subscription": "sub_1Rbu7tFHp5a6uQihClPjLcC6"
      },
      "type": "subscription_details"
    },
    "payment_settings": {
      "default_mandate": null,
      "payment_method_options": {
        "acss_debit": null,
        "bancontact": null,
        "card": {
          "request_three_d_secure": "automatic"
        },
        "customer_balance": null,
        "konbini": null,
        "sepa_debit": null,
        "us_bank_account": null
      },
      "payment_method_types": null
    },
    "period_end": 1750384339,
    "period_start": 1750384339,
    "post_payment_credit_notes_amount": 0,
    "pre_payment_credit_notes_amount": 0,
    "receipt_number": null,
    "rendering": null,
    "shipping_cost": null,
    "shipping_details": null,
    "starting_balance": 0,
    "statement_descriptor": null,
    "status": "paid",
    "status_transitions": {
      "finalized_at": 1750384339,
      "marked_uncollectible_at": null,
      "paid_at": 1750384340,
      "voided_at": null
    },
    "subtotal": 499,
    "subtotal_excluding_tax": 499,
    "test_clock": null,
    "total": 499,
    "total_discount_amounts": [],
    "total_excluding_tax": 499,
    "total_pretax_credit_amounts": [],
    "total_taxes": [],
    "webhooks_delivered_at": 1750384339
  },
  "previous_attributes": null
}

## customer.updated

{
  "id": "evt_1Rbu7uFHp5a6uQih3yxAUnYw",
  "object": "event",
  "api_version": "2025-05-28.basil",
  "created": 1750384339,
  "data": {
    "object": {
      "id": "cus_SWy3sIVVDOYA6N",
      "object": "customer",
      "address": {
        "city": null,
        "country": "US",
        "line1": null,
        "line2": null,
        "postal_code": "10011",
        "state": null
      },
      "balance": 0,
      "created": 1750384339,
      "currency": "usd",
      "default_source": null,
      "delinquent": false,
      "description": null,
      "discount": null,
      "email": "leah.delaney.stewart@gmail.com",
      "invoice_prefix": "NGCUJA3V",
      "invoice_settings": {
        "custom_fields": null,
        "default_payment_method": null,
        "footer": null,
        "rendering_options": null
      },
      "livemode": true,
      "metadata": {},
      "name": "Leah Stewart",
      "next_invoice_sequence": 2,
      "phone": null,
      "preferred_locales": [
        "en-US"
      ],
      "shipping": null,
      "tax_exempt": "none",
      "test_clock": null
    },
    "previous_attributes": {
      "currency": null
    }
  },
  "livemode": true,
  "pending_webhooks": 1,
  "request": {
    "id": null,
    "idempotency_key": "d7398ab1-eec7-4d3a-8d86-b15be666de67"
  },
  "type": "customer.updated"
}