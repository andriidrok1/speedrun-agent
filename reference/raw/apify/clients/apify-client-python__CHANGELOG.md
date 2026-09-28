# Changelog

All notable changes to this project will be documented in this file.

## [3.2.1](https://github.com/apify/apify-client-python/releases/tag/v3.2.1) (2026-09-25)

### 🐛 Bug Fixes

- Stop dataset iterators from skipping items when unwind is used ([#1059](https://github.com/apify/apify-client-python/pull/1059)) ([8e30197](https://github.com/apify/apify-client-python/commit/8e301977ecb80b7c01251cacf071a3f6201469ba)) by [@vdusek](https://github.com/vdusek), closes [#1058](https://github.com/apify/apify-client-python/issues/1058)
- Keep a failing background watcher from breaking a successful actor call ([#1027](https://github.com/apify/apify-client-python/pull/1027)) ([efc009d](https://github.com/apify/apify-client-python/commit/efc009d78f08d3a03a10db386201e48e45d01c2d)) by [@vdusek](https://github.com/vdusek)
- Make `JsonSerializable` type alias read-only ([#1072](https://github.com/apify/apify-client-python/pull/1072)) ([bd82a26](https://github.com/apify/apify-client-python/commit/bd82a2645d3c64f0e4a30de3a016c16d92d48340)) by [@Pijukatel](https://github.com/Pijukatel)


## [3.2.0](https://github.com/apify/apify-client-python/releases/tag/v3.2.0) (2026-09-03)

### 🚀 Features

- Add Actor task publication endpoints ([#985](https://github.com/apify/apify-client-python/pull/985)) ([139a426](https://github.com/apify/apify-client-python/commit/139a42691c6d8aae4ccff02911b554da6ccc8a4a)) by [@apify-service-account](https://github.com/apify-service-account)
- Unify the request pipeline across HTTP clients ([#1022](https://github.com/apify/apify-client-python/pull/1022)) ([00ce055](https://github.com/apify/apify-client-python/commit/00ce055ac6a6868a4e654f1e4bf14f5e77d7631d)) by [@vdusek](https://github.com/vdusek)
- Add HTTPX-based HTTP client ([#1004](https://github.com/apify/apify-client-python/pull/1004)) ([19509a2](https://github.com/apify/apify-client-python/commit/19509a254eea656ffee959499ed99257259233f0)) by [@vdusek](https://github.com/vdusek)

### 🐛 Bug Fixes

- Require unique_key and url in RequestBase, add RequestWithoutId ([#1030](https://github.com/apify/apify-client-python/pull/1030)) ([28efd13](https://github.com/apify/apify-client-python/commit/28efd1388d18ab20ae95da24af415cdad3aae152)) by [@apify-service-account](https://github.com/apify-service-account)
- Drop pricing_infos from CreateActorRequest and clarify apify_margin_percentage docs ([#1031](https://github.com/apify/apify-client-python/pull/1031)) ([ebeda95](https://github.com/apify/apify-client-python/commit/ebeda95cdec93f0b7405d9ecf65f04d4d5636737)) by [@apify-service-account](https://github.com/apify-service-account)
- Percent-encode caller-supplied URL path segments ([#1025](https://github.com/apify/apify-client-python/pull/1025)) ([3e333a0](https://github.com/apify/apify-client-python/commit/3e333a0ec27be660fb025c8daab92d6a3a1648d5)) by [@vdusek](https://github.com/vdusek)
- Send request queue write fields under the names the API declares ([#1026](https://github.com/apify/apify-client-python/pull/1026)) ([3b6e96e](https://github.com/apify/apify-client-python/commit/3b6e96e7e2e88c98c959de77dd219fe8785ae0f0)) by [@vdusek](https://github.com/vdusek)
- Prevent losing a status message when redirecting Actor run logs ([#1036](https://github.com/apify/apify-client-python/pull/1036)) ([dba6aba](https://github.com/apify/apify-client-python/commit/dba6aba9088f69819c83190883c6e8ccd14b474d)) by [@vdusek](https://github.com/vdusek)
- Loosen StoreListActor.picture_url to str and add new API error type ([#1038](https://github.com/apify/apify-client-python/pull/1038)) ([a098dd5](https://github.com/apify/apify-client-python/commit/a098dd523ffa2037127ba22a096201587e61146e)) by [@apify-service-account](https://github.com/apify-service-account)
- Accept task input lists, omitted run and private user fields, and datetime usage dates ([#1041](https://github.com/apify/apify-client-python/pull/1041)) ([6a218f8](https://github.com/apify/apify-client-python/commit/6a218f803527e9b6104fc772247d09d847f075c9)) by [@apify-service-account](https://github.com/apify-service-account)
- Update impit to ~=0.14.0 ([#1044](https://github.com/apify/apify-client-python/pull/1044)) ([779b17f](https://github.com/apify/apify-client-python/commit/779b17f3c7e79592a5533fe257c4aad9eb9c12b3)) by [@renovate[bot]](https://github.com/renovate[bot])
- Name the extra to install in optional-dependency import errors ([#1046](https://github.com/apify/apify-client-python/pull/1046)) ([56bca2a](https://github.com/apify/apify-client-python/commit/56bca2a2a9abe8f9617b87d92126b1a84560c8aa)) by [@vdusek](https://github.com/vdusek)
- Add the description field to Actor task models ([#1049](https://github.com/apify/apify-client-python/pull/1049)) ([89ac756](https://github.com/apify/apify-client-python/commit/89ac756dbe40a66fd2ecbe6e577c20e32f23f026)) by [@apify-service-account](https://github.com/apify-service-account)


## [3.1.3](https://github.com/apify/apify-client-python/releases/tag/v3.1.3) (2026-08-18)

### 🐛 Bug Fixes

- Require value in EnvVarRequest and allow null error messages in request dicts ([#1001](https://github.com/apify/apify-client-python/pull/1001)) ([4540199](https://github.com/apify/apify-client-python/commit/45401992edd31f2f4273eed5549fd9615226f17b)) by [@apify-service-account](https://github.com/apify-service-account)
- Warn when a requested timeout is capped at timeout_max ([#962](https://github.com/apify/apify-client-python/pull/962)) ([4281530](https://github.com/apify/apify-client-python/commit/4281530f0637215d00c2cb186c7917a5742e0bb8)) by [@vdusek](https://github.com/vdusek)
- Do not mask unrelated import errors when guarding optional dependencies ([#1009](https://github.com/apify/apify-client-python/pull/1009)) ([f57e9e7](https://github.com/apify/apify-client-python/commit/f57e9e7338503d700f0b675ae7097a369e65734f)) by [@vdusek](https://github.com/vdusek)
- Keep HttpResponse isinstance checks from consuming streamed responses ([#1010](https://github.com/apify/apify-client-python/pull/1010)) ([8a2bb7b](https://github.com/apify/apify-client-python/commit/8a2bb7bfb9e0078e1d1633e567760bb431ef60b4)) by [@vdusek](https://github.com/vdusek)
- Fail fast on transport errors a retry cannot fix ([#1019](https://github.com/apify/apify-client-python/pull/1019)) ([ab63eff](https://github.com/apify/apify-client-python/commit/ab63effe9da2ee0ef60729c10ee3b132d85cb60b)) by [@vdusek](https://github.com/vdusek)
- Classify and retry failures while reading a streamed error body ([#1020](https://github.com/apify/apify-client-python/pull/1020)) ([2760aa6](https://github.com/apify/apify-client-python/commit/2760aa67c7b2acc61cc69996f412120fabccc3d4)) by [@vdusek](https://github.com/vdusek)


## [3.1.2](https://github.com/apify/apify-client-python/releases/tag/v3.1.2) (2026-08-10)

### 🐛 Bug Fixes

- Read file-like KVS values before upload and reject unencodable ones ([#965](https://github.com/apify/apify-client-python/pull/965)) ([064b5cc](https://github.com/apify/apify-client-python/commit/064b5cccbce8b585f58271b089e4987c6559a7d8)) by [@vdusek](https://github.com/vdusek)
- Respect caller-supplied Content-Encoding for pre-compressed request bodies ([#997](https://github.com/apify/apify-client-python/pull/997)) ([b5541c9](https://github.com/apify/apify-client-python/commit/b5541c919923f69d537b4062e21c1f3c46396c7a)) by [@vdusek](https://github.com/vdusek), closes [#996](https://github.com/apify/apify-client-python/issues/996)

### ⚡ Performance

- Skip request-body compression for already-compressed content types ([#987](https://github.com/apify/apify-client-python/pull/987)) ([808bdde](https://github.com/apify/apify-client-python/commit/808bdde06ed1befe9d30bede0f947320240747a6)) by [@vdusek](https://github.com/vdusek)
- Skip request-body compression for small payloads ([#988](https://github.com/apify/apify-client-python/pull/988)) ([6bd31b2](https://github.com/apify/apify-client-python/commit/6bd31b2abb840ea9af1efc98bf984c85b8510ce3)) by [@vdusek](https://github.com/vdusek), closes [#934](https://github.com/apify/apify-client-python/issues/934)


## [3.1.1](https://github.com/apify/apify-client-python/releases/tag/v3.1.1) (2026-08-03)

### 🐛 Bug Fixes

- Add missing cannot-monetize-without-payout-billing-info error code ([#960](https://github.com/apify/apify-client-python/pull/960)) ([c1bffc6](https://github.com/apify/apify-client-python/commit/c1bffc6e9f67a8358769591006f46bb2831594d8)) by [@apify-service-account](https://github.com/apify-service-account)
- Normalize query params in dataset create_items_public_url ([#963](https://github.com/apify/apify-client-python/pull/963)) ([c3ecaa9](https://github.com/apify/apify-client-python/commit/c3ecaa96a43415d70d71c27e7dd177e9992c84e4)) by [@vdusek](https://github.com/vdusek)
- Keep pagination iterators advancing past fully-filtered pages ([#964](https://github.com/apify/apify-client-python/pull/964)) ([2e7f75c](https://github.com/apify/apify-client-python/commit/2e7f75ca951f2b7b59c319badd6e024d47fe67f1)) by [@vdusek](https://github.com/vdusek)


## [3.1.0](https://github.com/apify/apify-client-python/releases/tag/v3.1.0) (2026-07-20)

### 🚀 Features

- Add request body compression with optional brotli ([#927](https://github.com/apify/apify-client-python/pull/927)) ([a8a393b](https://github.com/apify/apify-client-python/commit/a8a393bfcca01c8396b461036a9978fa5b28e6bf)) by [@mixalturek](https://github.com/mixalturek), closes [#942](https://github.com/apify/apify-client-python/issues/942)

### 🐛 Bug Fixes

- Offload async request body compression to a worker thread ([#950](https://github.com/apify/apify-client-python/pull/950)) ([7ac3885](https://github.com/apify/apify-client-python/commit/7ac3885826f0010df63eee9f1d30b5aed825872e)) by [@vdusek](https://github.com/vdusek)
- Propagate last_run status&#x2F;origin filters to chained storage clients ([#954](https://github.com/apify/apify-client-python/pull/954)) ([fe24058](https://github.com/apify/apify-client-python/commit/fe24058bb29ed6e2f42ae754dce3f15e5f6628e6)) by [@vdusek](https://github.com/vdusek)
- Propagate API token to custom HTTP clients ([#956](https://github.com/apify/apify-client-python/pull/956)) ([ded0852](https://github.com/apify/apify-client-python/commit/ded0852ffb420055e04141eb2a46d2766c77f890)) by [@vdusek](https://github.com/vdusek)
- Make batch_add_requests split batches by serialized payload size ([#953](https://github.com/apify/apify-client-python/pull/953)) ([2adf515](https://github.com/apify/apify-client-python/commit/2adf515d3e8db47b7f75d69931580ab9269cb2e3)) by [@vdusek](https://github.com/vdusek)


## [3.0.6](https://github.com/apify/apify-client-python/releases/tag/v3.0.6) (2026-07-13)

### 🐛 Bug Fixes

- Relax constraints on generated models based on updated specification ([#936](https://github.com/apify/apify-client-python/pull/936)) ([a02247e](https://github.com/apify/apify-client-python/commit/a02247e817fd801c315d2848d3000af904deb95f)) by [@apify-service-account](https://github.com/apify-service-account)
- Relax enum validation to tolerate unknown API values ([#941](https://github.com/apify/apify-client-python/pull/941)) ([587baa7](https://github.com/apify/apify-client-python/commit/587baa77e023d7ba925a7d4eecaff58da3b55237)) by [@vdusek](https://github.com/vdusek), closes [#931](https://github.com/apify/apify-client-python/issues/931)
- Relax required stats fields (compute units, counts) to optional ([#947](https://github.com/apify/apify-client-python/pull/947)) ([46f1286](https://github.com/apify/apify-client-python/commit/46f1286773740867b2d44a0d330e898d7d46f732)) by [@apify-service-account](https://github.com/apify-service-account)
- Prevent Actor log-streaming thread from crashing on stream timeout ([#944](https://github.com/apify/apify-client-python/pull/944)) ([24dd614](https://github.com/apify/apify-client-python/commit/24dd614bd083a93735a12dccb4b7b1588e87f3ec)) by [@vdusek](https://github.com/vdusek), closes [#945](https://github.com/apify/apify-client-python/issues/945)


## [3.0.5](https://github.com/apify/apify-client-python/releases/tag/v3.0.5) (2026-07-08)

### 🐛 Bug Fixes

- Relax model validation constraints for `Plan` and `StoreListActor` ([#910](https://github.com/apify/apify-client-python/pull/910)) ([7a5b157](https://github.com/apify/apify-client-python/commit/7a5b157a20a1c6d04175a8f33d3f048af3ab5f9d)) by [@apify-service-account](https://github.com/apify-service-account)
- Add missing EventData fields and new error type ([#917](https://github.com/apify/apify-client-python/pull/917)) ([93566b8](https://github.com/apify/apify-client-python/commit/93566b883b269d1f7fb098c51c0677cd10ebcc7d)) by [@apify-service-account](https://github.com/apify-service-account)
- Add missing MCP to RunOrigin enum ([#929](https://github.com/apify/apify-client-python/pull/929)) ([3536c18](https://github.com/apify/apify-client-python/commit/3536c183adf495c26e65d50fd12fbdf584819a07)) by [@apify-service-account](https://github.com/apify-service-account)



## [3.0.4](https://github.com/apify/apify-client-python/releases/tag/v3.0.4) (2026-06-26)

### 🐛 Bug Fixes

- Fix casing in `isAtHome` in `User-Agent` header ([#903](https://github.com/apify/apify-client-python/pull/903)) ([1e50374](https://github.com/apify/apify-client-python/commit/1e50374e91bc39282bc724f77770963a14e051eb)) by [@Pijukatel](https://github.com/Pijukatel)
- Update impit to ~=0.13.0 ([#871](https://github.com/apify/apify-client-python/pull/871)) ([8dffe34](https://github.com/apify/apify-client-python/commit/8dffe34defbcd7b7c4a9cba9a1e1a2751c0096cd)) by [@renovate](https://github.com/apps/renovate)
- Remove unused run-failed and run-timeout-exceeded error models ([#900](https://github.com/apify/apify-client-python/pull/900)) ([8c48a06](https://github.com/apify/apify-client-python/commit/8c48a06395fc000ec1df15ccd27cc79d5a2dc46b)) by [@apify-service-account](https://github.com/apify-service-account)


## [3.0.3](https://github.com/apify/apify-client-python/releases/tag/v3.0.3) (2026-06-18)

### 🐛 Bug Fixes

- Include all supported fields for ad-hoc webhooks ([#855](https://github.com/apify/apify-client-python/pull/855)) ([6eb267d](https://github.com/apify/apify-client-python/commit/6eb267dbe620cb9d864c2390a84dfeb851cecc7c)) by [@apify-service-account](https://github.com/apify-service-account)
- Only log any error that happens during log redirection ([#866](https://github.com/apify/apify-client-python/pull/866)) ([a2cc987](https://github.com/apify/apify-client-python/commit/a2cc987b6d1ef1d06b37a179876b12ee4f739f5f)) by [@Pijukatel](https://github.com/Pijukatel), closes [#864](https://github.com/apify/apify-client-python/issues/864)


## [3.0.2](https://github.com/apify/apify-client-python/releases/tag/v3.0.2) (2026-05-26)

### 🐛 Bug Fixes

- Add missing response fields returned by the live API ([#821](https://github.com/apify/apify-client-python/pull/821)) ([e794411](https://github.com/apify/apify-client-python/commit/e794411dd3935cd09941096abc9767f33c4a4cf9)) by [@apify-service-account](https://github.com/apify-service-account)
- Prevent StreamedLog stop() from hanging on a silent stream ([#825](https://github.com/apify/apify-client-python/pull/825)) ([c15cb1b](https://github.com/apify/apify-client-python/commit/c15cb1bb2702120dd6fabe154a4b3d879248aafa)) by [@vdusek](https://github.com/vdusek)
- Flush StreamedLogAsync tail when stop() cancels the task ([#754](https://github.com/apify/apify-client-python/pull/754)) ([ea23338](https://github.com/apify/apify-client-python/commit/ea2333822937c4ad9b72fbba63e6fd7b52343055)) by [@vdusek](https://github.com/vdusek)


## [3.0.1](https://github.com/apify/apify-client-python/releases/tag/v3.0.1) (2026-05-22)

### 🐛 Bug Fixes

- Add new API error codes and drop obsolete UnknownBuildTagError model ([#813](https://github.com/apify/apify-client-python/pull/813)) ([d1e2020](https://github.com/apify/apify-client-python/commit/d1e202087a37e6ab5048b0b8724cc73a3769ea8e)) by [@apify-service-account](https://github.com/apify-service-account)
- Add support for tiered pricing in Actor charge events ([#818](https://github.com/apify/apify-client-python/pull/818)) ([c3ea8c1](https://github.com/apify/apify-client-python/commit/c3ea8c10ae1d606fd3954177b690703f220ae857)) by [@apify-service-account](https://github.com/apify-service-account), closes [#811](https://github.com/apify/apify-client-python/issues/811)
- Allow 128MB memory limits and add CI to RunOrigin in models ([#819](https://github.com/apify/apify-client-python/pull/819)) ([01eb993](https://github.com/apify/apify-client-python/commit/01eb9934467e17e669c51d1c1e6f7e0bce1a608e)) by [@apify-service-account](https://github.com/apify-service-account)


## [3.0.0](https://github.com/apify/apify-client-python/releases/tag/v3.0.0) (2026-05-20)

- Check out the [Upgrading guide](https://docs.apify.com/api/client/python/docs/upgrading/upgrading-to-v3) to ensure a smooth update.

### 🚀 Features

- [**breaking**] Introduce fully typed clients ([#604](https://github.com/apify/apify-client-python/pull/604)) ([81ee194](https://github.com/apify/apify-client-python/commit/81ee1943b400b49797868fe4dfa52d1662e09370)) by [@vdusek](https://github.com/vdusek), closes [#21](https://github.com/apify/apify-client-python/issues/21), [#481](https://github.com/apify/apify-client-python/issues/481)
- [**breaking**] Introduce tiered timeout system with per-endpoint configuration ([#653](https://github.com/apify/apify-client-python/pull/653)) ([723ec6e](https://github.com/apify/apify-client-python/commit/723ec6e5954474767a5ecbf4902d9b62f7d214f8)) by [@vdusek](https://github.com/vdusek)
- [**breaking**] Generate Literal type aliases instead of StrEnum classes ([#759](https://github.com/apify/apify-client-python/pull/759)) ([2bf5a75](https://github.com/apify/apify-client-python/commit/2bf5a75f38a74a48c5c9a9682d9eaf330da27935)) by [@vdusek](https://github.com/vdusek), closes [#576](https://github.com/apify/apify-client-python/issues/576)
- Make HTTP client pluggable with abstract base classes ([#641](https://github.com/apify/apify-client-python/pull/641)) ([5ae33a0](https://github.com/apify/apify-client-python/commit/5ae33a0a801fdacd0c456a8630fea053f9df6550)) by [@vdusek](https://github.com/vdusek), closes [#416](https://github.com/apify/apify-client-python/issues/416)
- Accept Pydantic models as alternatives to dicts in resource client methods ([#663](https://github.com/apify/apify-client-python/pull/663)) ([b778c20](https://github.com/apify/apify-client-python/commit/b778c2040228ff9f5a97765de10535cec3f0353e)) by [@vdusek](https://github.com/vdusek), closes [#421](https://github.com/apify/apify-client-python/issues/421)
- Add ownership parameter to storage collection listing methods ([#696](https://github.com/apify/apify-client-python/pull/696)) ([51a92a3](https://github.com/apify/apify-client-python/commit/51a92a31dac5dd433acfaea76155011d0892d8c8)) by [@nmanerikar](https://github.com/nmanerikar)
- Add filter and cursor parameters to list_requests method ([#743](https://github.com/apify/apify-client-python/pull/743)) ([3445ff7](https://github.com/apify/apify-client-python/commit/3445ff74e61d5f1f9a964f2ee3c14d198298f709)) by [@mvolfik](https://github.com/mvolfik)
- Add ApifyApiError subclasses grouped by HTTP status ([#737](https://github.com/apify/apify-client-python/pull/737)) ([a6daff7](https://github.com/apify/apify-client-python/commit/a6daff754e5e1af8a6230f4c504db24a246c734f)) by [@vdusek](https://github.com/vdusek), closes [#423](https://github.com/apify/apify-client-python/issues/423)
- Generate TypedDict types for input-side models ([#738](https://github.com/apify/apify-client-python/pull/738)) ([2fd66d0](https://github.com/apify/apify-client-python/commit/2fd66d0adf253dff470f40d0bfdbc620da0ed608)) by [@vdusek](https://github.com/vdusek), closes [#666](https://github.com/apify/apify-client-python/issues/666)
- Add iterate methods for paginated collections ([#771](https://github.com/apify/apify-client-python/pull/771)) ([3f3129c](https://github.com/apify/apify-client-python/commit/3f3129c729791d0e012070a77d7245b44a1f1180)) by [@Pijukatel](https://github.com/Pijukatel), closes [#539](https://github.com/apify/apify-client-python/issues/539)
- Accept camelCase keys in input TypedDicts ([#793](https://github.com/apify/apify-client-python/pull/793)) ([7a579bf](https://github.com/apify/apify-client-python/commit/7a579bf2083e93092cfa5ba411c1c38d5cba2085)) by [@vdusek](https://github.com/vdusek), closes [#756](https://github.com/apify/apify-client-python/issues/756)
- Expose WebhooksList and JsonSerializable from public types module ([#800](https://github.com/apify/apify-client-python/pull/800)) ([104011c](https://github.com/apify/apify-client-python/commit/104011c28bc08197d61e384126a4403acc3579f1)) by [@vdusek](https://github.com/vdusek)

### 🐛 Bug Fixes

- Prevent `_prepare_request_call` from mutating caller&#x27;s headers dict ([#746](https://github.com/apify/apify-client-python/pull/746)) ([d553162](https://github.com/apify/apify-client-python/commit/d5531621535f5a491be5b5791ea4b80e46de1405)) by [@vdusek](https://github.com/vdusek)
- Don&#x27;t block StatusMessageWatcher exit with 6s sleep on exception ([#753](https://github.com/apify/apify-client-python/pull/753)) ([48f5037](https://github.com/apify/apify-client-python/commit/48f50378e92e2058ff8e5aaba45ef9e3a6e5f081)) by [@vdusek](https://github.com/vdusek)
- Treat naive datetime query params as UTC ([#752](https://github.com/apify/apify-client-python/pull/752)) ([9ab096a](https://github.com/apify/apify-client-python/commit/9ab096a7453080a3079c7459079f99a30bd6a7cb)) by [@vdusek](https://github.com/vdusek)
- Raise NotFoundError on ambiguous 404 responses ([#755](https://github.com/apify/apify-client-python/pull/755)) ([701185e](https://github.com/apify/apify-client-python/commit/701185e6e8a98f0b14d83cab10139f1e19be3f47)) by [@vdusek](https://github.com/vdusek)
- Correct deadline logic in _wait_for_finish ([#749](https://github.com/apify/apify-client-python/pull/749)) ([fd0663e](https://github.com/apify/apify-client-python/commit/fd0663e22b31ddd289325146c9750ff07c068d6b)) by [@vdusek](https://github.com/vdusek)
- Preserve count=0 in RunClient&#x27;s charge ([#751](https://github.com/apify/apify-client-python/pull/751)) ([0a8942c](https://github.com/apify/apify-client-python/commit/0a8942c3a5728689e28e0273938a3509ebb5f58d)) by [@vdusek](https://github.com/vdusek)

### 🚜 Refactor

- [**breaking**] Update default timeout tiers on non-storage resource clients ([#664](https://github.com/apify/apify-client-python/pull/664)) ([0b35bbe](https://github.com/apify/apify-client-python/commit/0b35bbe212a8a64c5aea5d5d813315252760b055)) by [@vdusek](https://github.com/vdusek)
- [**breaking**] Mark secondary arguments as keyword-only ([#766](https://github.com/apify/apify-client-python/pull/766)) ([4ca99fd](https://github.com/apify/apify-client-python/commit/4ca99fd6a442ad12adbdfc866e72543c0feaf96b)) by [@vdusek](https://github.com/vdusek)
- [**breaking**] Remove deprecated APIs ([#799](https://github.com/apify/apify-client-python/pull/799)) ([6e5df35](https://github.com/apify/apify-client-python/commit/6e5df3595e5f858d944887445a9019dea1008e97)) by [@vdusek](https://github.com/vdusek)

### ⚙️ Miscellaneous Tasks

- [**breaking**] Drop support for Python 3.10 ([#636](https://github.com/apify/apify-client-python/pull/636)) ([7895a4e](https://github.com/apify/apify-client-python/commit/7895a4e60145f490911044da4aa7e3c1c424d416)) by [@vdusek](https://github.com/vdusek)

## [2.5.1](https://github.com/apify/apify-client-python/releases/tag/v2.5.1) (2026-05-20)

### 🐛 Bug Fixes

