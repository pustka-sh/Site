# Relay Lab

`/lab/relay` is a browser-only educational simulator, with no network requests or live Minecraft connections. It follows a sample player through handshake, authentication, initial backend selection, profile forwarding, configuration and play. A separate status-ping intent illustrates why a server-list reply does not prove that a client can join.

The protocol list and behavior were reviewed against Relay commit `b7ae15ea68ac5ac015851ad14b751bada2a1677a`. Source links in `src/data/relayLab.js` point to that exact revision. Update those links and review the teaching model deliberately when Relay changes.

## Exact and illustrative parts

The packet inspector serializes a complete, uncompressed and unencrypted client-to-proxy handshake frame. It includes the length prefix, packet ID, protocol VarInt, UTF-8 hostname length and data, unsigned big-endian port, and next-state VarInt. Field offsets include the frame prefix. The frame's declared length excludes its own prefix.

All other exchanges are explanatory stages, not serialized packets or real cryptography. Online authentication assumes a valid player and a successful session-server check. Offline authentication derives an unverified identity. Modern forwarding signs the identity Relay already has; it does not independently authenticate an account. Legacy forwarding has no signature, and no-forwarding mode changes the identity and address the backend sees.

The sample uses the ordered candidates `lobby` and `survival`. Normal, unreachable-first, both-unreachable and both-misconfigured scenarios show initial candidate retries. They do not model group balancing, every failure category, or recovery after a player has already committed to a backend's configuration.

For the matching modern setup, Paper's server.properties has online-mode=false, modern forwarding is enabled, the secret matches, and Paper's forwarded online-mode agrees with Relay. The mismatch scenario makes both sample backends require modern forwarding with a different secret. Changing client authentication does not repair that mismatch.

Tests independently decode frames, cover multi-byte lengths and UTF-8, verify supported protocol choices, and check that status requests and failed joins never claim a successful backend connection. Run `node --test test/relay-lab.test.mjs`.
