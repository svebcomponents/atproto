#!/usr/bin/env bash
# Generates the two production-only secrets apps/host needs
# (SESSION_SECRET, OAUTH_PRIVATE_KEYS). Prints them ready to paste into
# runtime.env / .env. Run again any time you want to rotate SESSION_SECRET
# or add another OAUTH_PRIVATE_KEYS line for key rotation.
set -euo pipefail

echo "SESSION_SECRET=$(openssl rand -hex 32)"

# OAUTH_PRIVATE_KEYS must be a single line. sqliteStores.ts's sibling,
# service.ts, does `keys.split("\n")` to support multiple newline-separated
# keys — a standard multi-line PEM (BEGIN / wrapped base64 / END on separate
# lines) gets shredded into fragments that each fail to import. `tr -d '\n'`
# collapses it to one line, which @atproto/jwk-jose's JoseKey.fromImportable
# (used in oauthClient.ts) imports just fine — verified directly against
# that import path, not just against openssl/jose in isolation.
KEY="$(openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt | tr -d '\n')"
echo "OAUTH_PRIVATE_KEYS=$KEY"
