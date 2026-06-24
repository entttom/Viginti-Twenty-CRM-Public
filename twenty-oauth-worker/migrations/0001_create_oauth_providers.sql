-- Managed OAuth providers (Mode B only).
--
-- Rows are created/updated exclusively by the local admin scripts. The table
-- never stores access tokens, refresh tokens, authorization codes or plaintext
-- client secrets. A confidential client's secret is stored AES-256-GCM
-- encrypted in `encrypted_client_secret`.

CREATE TABLE oauth_providers (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,

    issuer TEXT NOT NULL UNIQUE,
    authorization_endpoint TEXT NOT NULL,
    token_endpoint TEXT NOT NULL,
    registration_endpoint TEXT,

    client_id TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL
        CHECK (
            token_endpoint_auth_method IN (
                'none',
                'client_secret_post'
            )
        ),

    encrypted_client_secret TEXT,

    scope TEXT NOT NULL DEFAULT 'api profile',

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_oauth_providers_enabled
ON oauth_providers(enabled);

CREATE INDEX idx_oauth_providers_issuer
ON oauth_providers(issuer);
