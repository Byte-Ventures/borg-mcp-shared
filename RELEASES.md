# Release History

Eight published versions from 0.2.2 through 0.6.2, excluding the isolated 0.4.0
baseline, predate the canonical release-record convention. Historical incident
prose below remains their record instead of reconstructed structured entries.

`borgmcp-shared@0.4.0` is the published clean-slate v2 baseline and is
immutable, but its artifact predates the local/self-hosted package cleanup. The
immutable `v0.4.1` verification artifact exposed a platform-dependent SBOM audit
and must never be published, moved, reused, rerun, or substituted.
`borgmcp-shared@0.4.2` is published and immutable. `borgmcp-shared@0.4.3` is the
immutable protocol v2 session-lifecycle release. `borgmcp-shared@0.5.0` is the published protocol v3 attach-session contract
release: attach responses carry the exact non-expiring `session: { id }` shape.
`borgmcp-shared@0.5.1` is published and immutable under the accepted attempt-1
registry-propagation incident: annotated tag object `045268aa8873da330819860012ecaddb4bc2883c` peels to
`1981d7373e77f6edb4567872c1544bdbe2b1ef20`; workflow run `29984423571` published exact integrity
`sha512-XUJq+FjY/cbarU9V1dIWnhNYcqyURTiGb6KyIzg99gy5hk/fEs5ee/8X/qvp7pw1Rshqt2J6I3TVbwJdlde2tA==` and must never be rerun. Independent npm verification
confirmed its registry signature and SLSA provenance. `borgmcp-shared@0.6.0` was
never published: annotated tag object `90a1cf686a0ce32a7aef836b0b82a930191b9030`
peels to protected-main commit `fd69b08586481a60c88099dede8e4e066f73f2f2`;
attempt-1 workflow run `30054936226` failed in tests before build, packaging,
authentication, or registry mutation and must never be rerun or moved.
`borgmcp-shared@0.6.1`, `borgmcp-shared@0.6.2`, and
`borgmcp-shared@0.6.3` are published and immutable. `borgmcp-shared@0.6.4` is
published and immutable: annotated tag object
`f79b0683686d3c359023a17f6e8a92efd888104a` peels to protected-main commit
`fa8a2dc072d4ffe2a16d5f02576fead822a2f72e`; successful attempt-1 workflow run
`30169732628` published registry integrity
`sha512-Wm4b0uoOAw9JCz5OTHD0Q2uXKkeWYdkVksdeZvRG8l62XGMY+G8GkNEsZT9L533LbVbQ29GhgF0htjDenQThDg==`.
Never rerun or move that tag.
`borgmcp-shared@0.7.0` is published and immutable: annotated tag object
`5ddaf5821c49ac0893fdffbac6115b48d0795281` peels to protected-main commit
`30af2629052014feba3f3ebf4d9eb29e977e38a7`. Never rerun or move that tag.
`borgmcp-shared@0.7.1` is published and immutable: annotated tag object
`672423566ed75cf7704775cb480a75767e7c6851` peels to protected-main commit
`f4870596ba79702f2e4eb3a6620802d5e538052d`; successful attempt-1 workflow run
`30625736845` published it. Never rerun or move that tag.
`borgmcp-shared@0.10.0` is published and immutable: annotated tag `v0.10.0`
peels to protected-main commit `8e5bd088b8069951a687156c35cf68d44985ddc1`;
successful attempt-1 workflow run `31255563527` published registry integrity
`sha512-NYZJi6z0g/Txb6ge+5NgRPNRszVEi0eNmICxkoZq5bGkJWm5qEvNSt3ws90Xz8IOKuWcyHC9i6sAK6cbZxwYDw==`.
Never rerun or move that tag.
`borgmcp-shared@0.11.0` was published on 2026-08-11 and is immutable:
annotated tag `v0.11.0` peels to protected-main commit
`c1df96a858ff7c587d42508d388aa517a0b8545c`. PR #119 added the template
lifecycle document. PR #120 added local-model routing and ownership,
two-direction taxonomy agreement, the workflow-discipline mechanism split,
and minimalism completion. PR #121 added live-cube back-ports and the
external-surface single-owner directive rule. Successful attempt-1 workflow
run `31531549256` published registry integrity
`sha512-I8mixCbSrLKyOAAyqEI/HZJ8cML2rz3r812Up8pr547OdAk9LxZevdCo7ojG42ZwrUmS5u7iKQPg7Vk1XvtX1g==`.
Never rerun or move that tag.

`borgmcp-shared@0.12.3` is published and immutable. Annotated tag object
`e410256092974dcef9619415ebdf74acde3e4484` peels to protected-main commit
`9bfa43ced2af772d7a60f7be7828baaa146b4fd4`; successful tag workflow run
`31779837930` staged the exact candidate. Subsequent authorized npm stage
approval made the release live with registry integrity
`sha512-3GPQ1U7tBxg8Jp1Uac31CKKXQjMv4UNPhs5P6N83CyDXGJvkI88yowVJZGlLuo30eEk6jhERZ9AQWOjHst/sFA==`.
The tagged commit omitted `docs/releases/0.12.3.md`, so the normal GitHub Release
operator correctly refused to claim tagged notes. The GitHub Release at
https://github.com/Byte-Ventures/borg-mcp-shared/releases/tag/v0.12.3 uses an
explicit post-publication reconstruction from issue #138, merged PR #139, and
the exact `v0.12.2..v0.12.3` diff: the software-development template gained
proportionate Coordinator review gates, focused Builder verification and status
rules, and the tag-restricted npm staging boundary while preserving its seven
roles and routing contract. No post-hoc file is represented as tagged notes.
Never rerun or move that tag.

`borgmcp-shared@0.13.0` is published and immutable. Annotated tag object
`90022823ec91f4bc7964b2f1be1ef11c5f0e69dd` peels to protected-main commit
`e9b37697e4f265872d071d738740ee1eaded2ff9`; successful attempt-1 workflow run
`31897497966` staged the exact candidate. Authorized npm stage approval made
the release live with registry integrity
`sha512-6t25in3kpkVZTQqbeP65HgObU8GpOY3ewtY2SoaHDtIcJEtoe1LRwh3rguE6VqcqPWBUtmXdOaTMdtBErx5+oA==`.
Never rerun or move that tag.

`borgmcp-shared@0.14.0` was published on 2026-08-16 and is immutable. Annotated
tag object `4ecd4e54bbf5a3dd719855ccc4d6f9db3939800f` peels to protected-main commit
`a69926023d53268131e95b63efd141a17c634e2d`; successful attempt-1 workflow run
`31957839605` published registry integrity
`sha512-rKRMxnxTnW+o3WOqtAFoih9IeRKCZw/lltqz7CbjC1riNq52CsZ871o1Fo7Fdk0WqwuzdFQmRJ7qOzPi08Q/QA==`.
Never rerun or move that tag.
