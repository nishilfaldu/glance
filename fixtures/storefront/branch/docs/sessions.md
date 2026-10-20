# Sessions

Sessions are created at login and last 30 minutes. Each request sends the
session token as a bearer token.

## Rotation

Checkout rotates the session before charging. The new token is returned in
the `x-session-token` response header and the client swaps it in
automatically. Clients can also call `POST /session/refresh` to rotate a
session that is within 5 minutes of expiring.

Tokens are signed JWTs. Set `SESSION_SECRET` in every environment.
