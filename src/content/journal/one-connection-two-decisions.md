An incoming Minecraft connection crosses more than one boundary. The client first reaches Relay. Relay then chooses a backend and connects to it. A setting that makes sense at one boundary can break the other.

This note follows the distinction in [Relay’s login handler](https://github.com/pustka-sh/Relay/blob/8e61739a675435320c8b0fe48393e30181249082/proxy/src/main/java/dev/relay/session/LoginSessionHandler.java) and the [forwarding configuration](https://github.com/pustka-sh/Relay/blob/8e61739a675435320c8b0fe48393e30181249082/proxy/src/main/resources/relay.default.toml). It is an implementation walkthrough, not a release announcement.

# Who is joining?

Authentication answers a question about the player arriving at the proxy. With online authentication enabled, Relay verifies the player through Minecraft’s session service. With offline authentication, that verification does not happen.

The authentication choice belongs at the network entrance. It does not, by itself, tell a Paper backend how to read identity information sent by a proxy.

# What does the backend trust?

Forwarding is the next conversation. A backend needs to receive the player’s identity using the forwarding mode it expects. Relay and the backend must agree on that mode and, for modern forwarding, the shared secret.

Paper behind a proxy has its own authentication settings. Leaving backend `online-mode` enabled while configuring proxy forwarding can produce a setup that looks reasonable in two separate configuration files and fails when the files are used together. The [setup checker](/tools#setup-check) compares those files because the relationship between their values matters.

A forwarding secret protects the forwarding exchange. It does not replace controlling who can reach a backend. The backend should only accept connections from the proxy through the network’s firewall or equivalent private networking rules. See the [current setup guide](/docs/quickstart) for the actual configuration.

# Status is a different path

The server list status request is not a player login. A successful status response can establish that an address answers Minecraft status requests. It does not prove that authentication, backend selection, and forwarding will succeed for a joining player.

That is why a reachable server and a working login are different observations. Check the step where the connection stops rather than treating every failure as a forwarding problem.

# Follow the boundary

The [Relay Lab](/lab/relay) makes these stages visible: handshake, authentication, routing, backend connection, and forwarding. Its scenarios are illustrative traces in the browser. They do not connect to a running proxy or certify a deployment.

Start with one setting change and follow the affected stage. Then compare the explanation with the source revision linked by the Lab. For an actual network, use the setup checker and the proxy and backend logs alongside that model.
