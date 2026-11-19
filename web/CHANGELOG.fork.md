# Changelog

## [1.9.0](https://github.com/jrmatherly/career-ops/compare/web-v1.8.0...web-v1.9.0) (2026-11-19)


### Features

* **pdf:** fit a tailored CV to two pages with a dense template and a Volunteer section ([9f4635f](https://github.com/jrmatherly/career-ops/commit/9f4635f4b23083fcfdc206a17d00e09453291f60))
* **templates:** give every shipped CV template a Volunteer section ([b3f78d3](https://github.com/jrmatherly/career-ops/commit/b3f78d3c8980a1261c974e492e88ae54ab74ba1d))
* **web:** build an over-length CV in the dense template before saving it ([cf01b7e](https://github.com/jrmatherly/career-ops/commit/cf01b7e4afeef67b39d7969ef264db497d0a4c12))
* **web:** state the page limit and the keep-every-section rule in the pdf prompt ([8dff016](https://github.com/jrmatherly/career-ops/commit/8dff016929af4bc06a8a1d463be02566a9a52bf1))


### Bug Fixes

* **pdf:** keep the dense Interests line at body size and a locked Skills section out of the markdown fold ([da2ffc1](https://github.com/jrmatherly/career-ops/commit/da2ffc114e79dafbf42040797957d9bf07f3d65e))
* **templates:** give the dense template an Interests section and say when the photo is left out ([e157e50](https://github.com/jrmatherly/career-ops/commit/e157e50a78fc52dbf67398de78372c488f012697))
* **web:** build the ATS variant in dense when dense is the selected template ([cdde930](https://github.com/jrmatherly/career-ops/commit/cdde930d3524a1b36539473fca7a97e3cdbcae46))
* **web:** count pages with cv.md present and warn when the count fails ([e314bd2](https://github.com/jrmatherly/career-ops/commit/e314bd24becb321746ae79cbff9748e99b17a21c))
* **web:** exempt locked sections from the shortening order in the pdf prompt ([4e43a3c](https://github.com/jrmatherly/career-ops/commit/4e43a3c15c6219b79b5d25393a469e0df1b889e5))
* **web:** fit the ATS variant with the styled CV and report a dense build that still overflows ([a1f3579](https://github.com/jrmatherly/career-ops/commit/a1f35793241a55156b5a8ebc723516cf0eea7110))

## [1.8.0](https://github.com/jrmatherly/career-ops/compare/web-v1.7.1...web-v1.8.0) (2026-11-18)


### Features

* **drain:** queue a no-api-text row again once its board has a text reader ([5358edf](https://github.com/jrmatherly/career-ops/commit/5358edf80ce4aadd836007e5a42cb5f3a941c59b))
* **inbox:** filter the Inbox by location fit ([7cdcb1b](https://github.com/jrmatherly/career-ops/commit/7cdcb1b2807f87749c3331d9cf8d24d3f1c83a7f))
* **inbox:** judge every pending row against the scheduled scans' holds ([c733dc1](https://github.com/jrmatherly/career-ops/commit/c733dc11d2ab957b81cd499fb9039a4b52f81e25))
* **inbox:** mark and filter postings that need a manual score ([42756c5](https://github.com/jrmatherly/career-ops/commit/42756c590509d3f40f3d4d0235285ea90267862d))
* **inbox:** read Google posting text, queue skipped rows again, and mark rows that need a manual score ([e45197d](https://github.com/jrmatherly/career-ops/commit/e45197de81403b5a251087137980e2740573cbae))
* **inbox:** say in the Score confirm which rows are not a location fit ([c87e185](https://github.com/jrmatherly/career-ops/commit/c87e1858a572894103ff4649fe1fbc75ad9a4b93))
* **inbox:** show a location verdict on every pending row and hold automatic evaluation on it ([4a34aa4](https://github.com/jrmatherly/career-ops/commit/4a34aa4e1893570eba8efbc717cf479ba81c2f1d))
* **inbox:** show the location verdict on every pending row ([09a68f3](https://github.com/jrmatherly/career-ops/commit/09a68f35726ff1ed959dd76625990a2a220fee4a))
* **scheduled-scans:** add home states to the location hold ([233df9e](https://github.com/jrmatherly/career-ops/commit/233df9e352d14448edecf45d090324f4bad48ad2))
* **scheduled-scans:** hold automatic evaluation on the location verdict ([57e2813](https://github.com/jrmatherly/career-ops/commit/57e2813cb615826e26454d4c85a72cc766352b3a))
* **scheduled-scans:** keep a comma inside a location chip ([359b8f3](https://github.com/jrmatherly/career-ops/commit/359b8f3e3925a364709dabd673ba79568310015f))


### Bug Fixes

* **drain:** keep a failed re-queue write from stopping the drain, and close the review findings ([afe86a9](https://github.com/jrmatherly/career-ops/commit/afe86a98e4930021bc1f1184ebeb642a806a00c1))
* **inbox:** close the review findings on PR 110 ([967af83](https://github.com/jrmatherly/career-ops/commit/967af836a58798e11ffc8a932fc980ab6693df5e))
* **inbox:** drop a saved verdict the Inbox no longer gives, and refuse a null home-states list ([5630c61](https://github.com/jrmatherly/career-ops/commit/5630c61f366bf773c381e9f4feec4ae0e0f3e75c))
* **inbox:** drop the manual-score badge from a row that has a score ([6e76b2b](https://github.com/jrmatherly/career-ops/commit/6e76b2b43d6a4df9f43830e0b615a91eb2a4b9cb))
* **inbox:** keep a typed entry whole on paste and on Enter, and say when no hold was judged ([3c056f0](https://github.com/jrmatherly/career-ops/commit/3c056f02b9eac8d7c38be04ccf2ac8d0e5e8ad14))
* **inbox:** keep the manual-score mark when the other ledger entry is queued or failed, and close the review findings ([8e123fd](https://github.com/jrmatherly/career-ops/commit/8e123fd47b6287cc5be2aa97dca4222a6f2e8244))
* **inbox:** say on the page when the evaluation queue cannot be read, and leave a posting that moved on unmarked ([fa72c70](https://github.com/jrmatherly/career-ops/commit/fa72c7078b6f9636b735d6051dda632403f9a599))

## [1.7.1](https://github.com/jrmatherly/career-ops/compare/web-v1.7.0...web-v1.7.1) (2026-11-17)


### Bug Fixes

* **apply:** abort the prefill request when the user leaves, so its planner stops ([478d8aa](https://github.com/jrmatherly/career-ops/commit/478d8aa723ad1b9909ed8519a2560592c908c587))
* **apply:** check for a cancel before finalizing a driven session ([e4263f9](https://github.com/jrmatherly/career-ops/commit/e4263f979a9cc726255c43d53fc3fe3ec253d277))
* **audit:** fix the defects the 2026-11-16 project audit confirmed ([a17c841](https://github.com/jrmatherly/career-ops/commit/a17c8416f22320f31781caa67d99d12101e70247))
* close the four data and security findings from the PR 100 review ([727b595](https://github.com/jrmatherly/career-ops/commit/727b595172ab775d575e744abf1c75557a79d67e))
* **cv-studio:** give the live CV preview the preview CSP ([67caa2d](https://github.com/jrmatherly/career-ops/commit/67caa2d69215a12008e2964875501b2f1e414730))
* **cv-studio:** place the preview CSP ahead of all CV markup ([a955162](https://github.com/jrmatherly/career-ops/commit/a9551628a254d8f127e6c1da3164767a11040181))
* **deps:** update dependency next to v16.4.5 [security] ([d576a19](https://github.com/jrmatherly/career-ops/commit/d576a19836c36180b1aacc340b1898117fc30078))
* **hooks:** compare hooks paths by their native real path, so a Windows short name matches ([0f0236a](https://github.com/jrmatherly/career-ops/commit/0f0236aaeeed48fe6ce8d4c64b8a49ca915eb95a))
* require one check for every gating job, take the Next.js security bump, admit US-remote postings ([fcdfcde](https://github.com/jrmatherly/career-ops/commit/fcdfcde3e42a0c5ac1c0b59cc38cb3464c4abb3f))
* **run:** deny secret reads to attended network runs and keep career-ops keys from read-only agents ([a9344de](https://github.com/jrmatherly/career-ops/commit/a9344de3b7b59afe5b79685e933f5fe044aecefa))
* **run:** deny the contact files to attended runs and say when a run loses its read denies ([86cb474](https://github.com/jrmatherly/career-ops/commit/86cb474b6a0cf1ba7f1e91a400e4ce6739e364c9))
* **run:** strip more keys from read-only agents and document what the read fence refuses ([90c8e79](https://github.com/jrmatherly/career-ops/commit/90c8e797cb0be96e65d9d597364d87f81e69ba91))
* **web:** a failed pipeline refresh keeps the data already shown ([3bef52c](https://github.com/jrmatherly/career-ops/commit/3bef52cde632318b6e3fef215a74da767f1a7277))
* **web:** a failed worker run saves its log ([d22fa91](https://github.com/jrmatherly/career-ops/commit/d22fa91249d6f24d23861472a17012f32a42915b))
* **web:** apply sessions close on page exit, on expiry and on a failed open ([404de4b](https://github.com/jrmatherly/career-ops/commit/404de4b1f9bb0460abc625b1137e29109104f4a1))
* **web:** child-process output is decoded as a UTF-8 stream ([3717c22](https://github.com/jrmatherly/career-ops/commit/3717c228d464a6b56f8e3ff12fea09ce5f873688))
* **web:** close the saved run log masking gaps the review reproduced ([f2c4b86](https://github.com/jrmatherly/career-ops/commit/f2c4b860b74aea1f4bf37d7b615124fb5828fcea))
* **web:** cut each saved run field once, mask it, then drop the word the cut split ([682a537](https://github.com/jrmatherly/career-ops/commit/682a5376fedd697b49df5f04e37fecf21c653fd9))
* **web:** dismissing a running worker stops its run ([bc4c634](https://github.com/jrmatherly/career-ops/commit/bc4c634c8338f918f06a99ef6f9f435db01dca90))
* **web:** do not save a run log when the data root .env cannot be read ([3d6c22b](https://github.com/jrmatherly/career-ops/commit/3d6c22bd9e21544e9e59a1d428655cc98ae52c73))
* **web:** drop the scheme and value after a split Authorization label ([4d1c6b7](https://github.com/jrmatherly/career-ops/commit/4d1c6b776a3edea8a2eb33a347bfef50163cb06b))
* **web:** drop the value after a label the output bound split ([111629e](https://github.com/jrmatherly/career-ops/commit/111629e2cd7a1e1f087007703d7958dea42f79f0))
* **web:** drop the word the masker's bound lands in when saving a run ([37059bc](https://github.com/jrmatherly/career-ops/commit/37059bc089d35744965a15fd4117c6346c6c7096))
* **web:** exempt a path from password masking only for the shell's own PWD= ([b96b195](https://github.com/jrmatherly/career-ops/commit/b96b195e968c84e44982c03a90acddabb64906c5))
* **web:** keep a handed-off apply window open, and drop the session timer ([422b2be](https://github.com/jrmatherly/career-ops/commit/422b2beb7b834fce9562fbff896aaf85ba84c72f))
* **web:** keep a label a known value would replace, and show a run log that was not saved ([564b0ad](https://github.com/jrmatherly/career-ops/commit/564b0ad4828ea35010ccca9123906578711400da))
* **web:** keep a long single-line run output when trimming its cut first token ([2809e67](https://github.com/jrmatherly/career-ops/commit/2809e6788f64ef6ca0d3a420249c60ae6764eab8))
* **web:** keep the pipeline loading until the latest refresh ends ([f62e310](https://github.com/jrmatherly/career-ops/commit/f62e31013b36dc39bb31a6f64e2ab6fe12a1adbf))
* **web:** leaving the apply page stops the prefill and drive agents ([093abf5](https://github.com/jrmatherly/career-ops/commit/093abf56f8282c892e53e0d08b8a9a735703b2cd))
* **web:** mask a Basic or Bearer credential that holds no digit ([8bd518c](https://github.com/jrmatherly/career-ops/commit/8bd518c95d994cf893c3b54d14783d500dd16060))
* **web:** mask a credential that begins with a known value, whole ([9851d30](https://github.com/jrmatherly/career-ops/commit/9851d30acbae6658dbbd2aa3b60038cd6966a524))
* **web:** mask a credential the length cut would split, and stop apply work after a cancel ([6613db8](https://github.com/jrmatherly/career-ops/commit/6613db8e7f9f496cf9898e108a7fa57b58ed5420))
* **web:** mask a password assigned with : or = whatever its length or characters ([e4d27ae](https://github.com/jrmatherly/career-ops/commit/e4d27ae01a4ab2edc8cf3dcf31410b21782a6346))
* **web:** mask a password that looks like a path, and a secret that overlaps its own repeat ([5408de2](https://github.com/jrmatherly/career-ops/commit/5408de2436a895714d30b02b6dd0ae8367bf9265))
* **web:** mask a saved run log by the server's own secret values, before the cut ([848b29e](https://github.com/jrmatherly/career-ops/commit/848b29ee959e69130346c1ed65a4a695133c8376))
* **web:** mask a secret-named path or URL, and leave nothing after a password's mark ([e727c45](https://github.com/jrmatherly/career-ops/commit/e727c45f45472234e2bb01beb292dc8932eb4c89))
* **web:** mask a short Authorization value, and drop a split label's value when a space precedes its colon ([43b5c40](https://github.com/jrmatherly/career-ops/commit/43b5c405fc81d6a8de620aded2ec0a07973514cd))
* **web:** mask an assigned password of any length ([a8e3233](https://github.com/jrmatherly/career-ops/commit/a8e32334e3790997f64492c79d383f33901c7115))
* **web:** mask camelCase secret labels and slash-leading values ([4f5d183](https://github.com/jrmatherly/career-ops/commit/4f5d1836eb7037b5c7368b8cade6944019bd04eb))
* **web:** mask every saved run field and bound the masker's input ([d223e5b](https://github.com/jrmatherly/career-ops/commit/d223e5ba97ed23858d6f0b0edc7e879d8bf3c8bf))
* **web:** mask run output before the cut drops its first word, and stop a cancelled drive turn ([71560bf](https://github.com/jrmatherly/career-ops/commit/71560bfb686f7569dbcffe09542ff80756f68a92))
* **web:** name the signal that killed a step, and say which read denies a run lost ([18dab1c](https://github.com/jrmatherly/career-ops/commit/18dab1c3e4912934cf81384a1d4865e272c6e463))
* **web:** post-run render and persist scripts have a kill timeout ([923771c](https://github.com/jrmatherly/career-ops/commit/923771ceec79d5bcb54a070f93099e0b14e01db8))
* **web:** read pending rows from the same section range as the ranker ([7ce8f32](https://github.com/jrmatherly/career-ops/commit/7ce8f320ed79cccdb7a56946afaba8ccef8be5f2))
* **web:** report a timed-out step and a failed run-log save for what they are ([183c03a](https://github.com/jrmatherly/career-ops/commit/183c03aeb1f5091c0d4cc05310abcbda9700155a))
* **web:** scheduled scan dialogs name their close buttons and fields ([3299242](https://github.com/jrmatherly/career-ops/commit/329924200b7a47e0df862cb74f8fe11fb6bad87e))
* **web:** send nosniff and no-referrer on every response ([e1aa0fb](https://github.com/jrmatherly/career-ops/commit/e1aa0fb608dbc9c8d7b72e506ab7dcd2ff6f2027))
* **web:** skip a path or URL value only under a name that says it is a location ([6cf80d0](https://github.com/jrmatherly/career-ops/commit/6cf80d043d8890665b02a6ec8d0e51eaa3834874))
* **web:** take the rest of a URL password after a known value, and read 12-draft as a row number ([d229c2e](https://github.com/jrmatherly/career-ops/commit/d229c2e757fe4a43aa532073448803f344ee337b))
* **web:** treat a secret-named variable as a secret whatever its value looks like ([6c07c78](https://github.com/jrmatherly/career-ops/commit/6c07c788f4370345c6de59f86c05b42c9368ab13))

## [1.7.0](https://github.com/jrmatherly/career-ops/compare/web-v1.6.0...web-v1.7.0) (2026-11-16)


### Features

* **scan:** a portals.yml entry can slow its own requests with request_delay_ms, set from the Portals page ([52c6ae3](https://github.com/jrmatherly/career-ops/commit/52c6ae33bd2bc6fdc13278efc1d62296416e2e4c))
* **scan:** a portals.yml entry can slow its own requests with request_delay_ms, set from the Portals page ([67ddd9f](https://github.com/jrmatherly/career-ops/commit/67ddd9f678300676944c83d4c897e789ac33f0f6))


### Bug Fixes

* **scan:** the portal checks pace every request and cap the wait, and the Portals page flags an ignored delay ([2fc3742](https://github.com/jrmatherly/career-ops/commit/2fc3742749d3c3af9a9f724a2e74ee9ea3e29561))

## [1.6.0](https://github.com/jrmatherly/career-ops/compare/web-v1.5.0...web-v1.6.0) (2026-11-15)


### Features

* **explore:** fit filter, multi-key sort with direction, and list view for scan results ([#7061](https://github.com/jrmatherly/career-ops/issues/7061)) ([3a758d2](https://github.com/jrmatherly/career-ops/commit/3a758d257b049aed753af9ad07af44918a110869))
* **liveness:** JD text routes for Eightfold and Atlassian postings ([ee5e5dd](https://github.com/jrmatherly/career-ops/commit/ee5e5dd2ba372daed75ac635af18cd85dce74030))


### Bug Fixes

* **apply:** report a closed Ashby posting when the page says "Job not found" ([#7097](https://github.com/jrmatherly/career-ops/issues/7097)) ([7d41185](https://github.com/jrmatherly/career-ops/commit/7d411851655ad4e52158eab483edb0ec496d59e1))
* **liveness:** text-only JD routes stay out of the page readers, the Atlassian feed is cached, and the drain gives up on a posting with no text ([2e33aa8](https://github.com/jrmatherly/career-ops/commit/2e33aa8115b1a8c05506bd0c03e64b4220b60f94))
* **url-key:** stop a re-evaluation from adding a second tracker row for the same posting ([#7084](https://github.com/jrmatherly/career-ops/issues/7084)) ([50ffd0e](https://github.com/jrmatherly/career-ops/commit/50ffd0e840bd0be231779c48999589c431fa4904))
* **web:** a changed no-text reason does not restart the drain's one-day wait ([c7489f5](https://github.com/jrmatherly/career-ops/commit/c7489f5448ae65585f68cace668d3e94db787778))
* **web:** a profile save refreshes the template gallery, and review fixes for the sync ([f849c01](https://github.com/jrmatherly/career-ops/commit/f849c01f65dd9b9c5fa90150fbd9d0595eaa7dac))
* **web:** a template change reloads the Settings view ([14ff0b2](https://github.com/jrmatherly/career-ops/commit/14ff0b2cf30414f3ea926bdef0d33980a84ee5cd))
* **web:** no "Show in Finder" on a hosted install, and the job not-found page uses the page frame ([a248519](https://github.com/jrmatherly/career-ops/commit/a248519c765662e68f384cae014d7d4c49eef713))
* **web:** the drain gives up on a posting only after four tries over a day ([039d7ae](https://github.com/jrmatherly/career-ops/commit/039d7ae2c32775fa38de9cbdd4495f733b593174))
* **web:** the Settings form survives a failed refresh, and an edit overtaken by a gallery change is dropped with a notice ([2840695](https://github.com/jrmatherly/career-ops/commit/28406954fde58f85b4167868981a04271a89ca98))

## [1.5.0](https://github.com/jrmatherly/career-ops/compare/web-v1.4.0...web-v1.5.0) (2026-11-15)


### Features

* **web:** a scheduled scan can read only named source groups ([b73b385](https://github.com/jrmatherly/career-ops/commit/b73b385c8b2e69ac1d9abde97ad5f964b3ae563b))
* **web:** a scheduled scan can store a location hold ([9fa015f](https://github.com/jrmatherly/career-ops/commit/9fa015fe807f9a091a5c438d61b1f3a583faca71))
* **web:** auto-evaluation holds postings outside the job's locations ([ad38e37](https://github.com/jrmatherly/career-ops/commit/ad38e37c485203de3373f5d65a4d47ef7cb3254c))
* **web:** pick the rows a location hold keeps back ([cf2acb8](https://github.com/jrmatherly/career-ops/commit/cf2acb8b6439052da3e735963fe711c0b7ac58a3))
* **web:** scheduled scan source groups and a location hold on auto-evaluation ([f5b1db5](https://github.com/jrmatherly/career-ops/commit/f5b1db5d3650a34aa2bb2980438f966292d5f7bf))
* **web:** show held postings in the Inbox and the hold in the job form ([0c1c489](https://github.com/jrmatherly/career-ops/commit/0c1c4894270191180db44d31a2ae728ecf3139c1))


### Bug Fixes

* **scan:** a state counts only directly beside the home place name ([5406f58](https://github.com/jrmatherly/career-ops/commit/5406f58eec5345b92073d6844bd1f1299ad7eb64))
* **scan:** a trailing qualifier does not hide a foreign country slot ([c399eb1](https://github.com/jrmatherly/career-ops/commit/c399eb1cc2f8dfa4cd4045263bd8e5fda76ff538))
* **scan:** keep a state's evidence with the home place it sits beside ([655769a](https://github.com/jrmatherly/career-ops/commit/655769aa073f04d56c15d9974b418e9530ae7841))
* **scan:** only the first state token and the street segment leave a home place ([4867bc3](https://github.com/jrmatherly/career-ops/commit/4867bc3750d29465150506c95db9523940e6378f))
* **web:** a run stays due while its hold is broken, and each home place is judged alone ([a3a2a5b](https://github.com/jrmatherly/career-ops/commit/a3a2a5beeb8efce24d3352ad7550c4e526d37fe9))
* **web:** an unchanged save keeps a stored hold the form cannot show in full ([f9eab9d](https://github.com/jrmatherly/career-ops/commit/f9eab9dd8c9601fa3d81e3c88e1a930acc0cb190))
* **web:** close the PR review's findings on the hold, groups and the gate ([3633aa1](https://github.com/jrmatherly/career-ops/commit/3633aa1ba9965750bf387999aedad6327de8f50f))
* **web:** keep a hold the form cannot show, and index scan history once ([9609953](https://github.com/jrmatherly/career-ops/commit/9609953728fc640729e66c370529708943ff1f61))
* **web:** refuse a source group name that cleans away, and a county written Co.Dublin ([7d669a1](https://github.com/jrmatherly/career-ops/commit/7d669a1666a1aaf7b944471b764c50d37ac245e0))
* **web:** source groups and the hold fail closed on the review's cases ([8ab05b7](https://github.com/jrmatherly/career-ops/commit/8ab05b7ee4a8894dbb798374ab4c5e696fd402da))
* **web:** the drain applies a job's location hold too ([f598eec](https://github.com/jrmatherly/career-ops/commit/f598eeca86938c3b528018bbd7525c0ed52cb8ed))

## [1.4.0](https://github.com/jrmatherly/career-ops/compare/web-v1.3.0...web-v1.4.0) (2026-11-14)


### Features

* **modes:** recruiter advice follow-ups, and the PDF atomic-write suite pins its data root ([#87](https://github.com/jrmatherly/career-ops/issues/87)) ([c3acc77](https://github.com/jrmatherly/career-ops/commit/c3acc77a87eef4975b0df30fc8f6e8c72d38a95c))

## [1.3.0](https://github.com/jrmatherly/career-ops/compare/web-v1.2.0...web-v1.3.0) (2026-11-13)


### Features

* **web:** Portals can be filtered by board type ([0ebc1e2](https://github.com/jrmatherly/career-ops/commit/0ebc1e280c405e56de6d52d5a061878b23561dd6))


### Bug Fixes

* **web:** a board type is one filter option however the entry cases its provider ([1bdf82d](https://github.com/jrmatherly/career-ops/commit/1bdf82d66be00a2039c91a7849e00f8a26c3ebab))
* **web:** a company with no logo answers 204, so the console stays clean ([cf8beb9](https://github.com/jrmatherly/career-ops/commit/cf8beb993305613dcf13f899762ca0cae62f18a8))
* **web:** a run says when its sweep was stopped early ([fba4b3d](https://github.com/jrmatherly/career-ops/commit/fba4b3d906c2f0c5f6c95c448e3b9f8ccacf0362))
* **web:** a scheduled run records what its sweep dropped by tier, salary and content ([19f25a8](https://github.com/jrmatherly/career-ops/commit/19f25a8a387c9d88eb624dc6a39b20dcc246e291))
* **web:** a sweep the runner's timeout stops is recorded as failed, not as a success with 0 roles ([70de5fe](https://github.com/jrmatherly/career-ops/commit/70de5febec8d668b4b30b93abad578d5eb1db7d5))
* **web:** every chip button and text control is at least 24px tall ([792680c](https://github.com/jrmatherly/career-ops/commit/792680c5ff8812928b1da53de388a74166633650))
* **web:** page subtitles, tab names and scan buttons match the mockups ([77af428](https://github.com/jrmatherly/career-ops/commit/77af42835d538de66f595221c3514fdc63a8d7b3))
* **web:** post-deploy follow-ups for 2.2.0: 24px targets, mockup copy, board filter ([36adf3c](https://github.com/jrmatherly/career-ops/commit/36adf3ca7a499d8a33a8f97684cc760b27c53ecf))
* **web:** the Analytics description takes its figures from the Progress panel's metrics ([0306dd4](https://github.com/jrmatherly/career-ops/commit/0306dd4b1fcd9c7b57904973ab6e01715f16cdaa))

## [1.2.0](https://github.com/jrmatherly/career-ops/compare/web-v1.1.2...web-v1.2.0) (2026-11-13)


### Features

* **web:** a quieter sidebar foot, a docked Ask tab and the review's fixes ([88153c5](https://github.com/jrmatherly/career-ops/commit/88153c50c007f07f49b0e43f00618e2c1646bc2a))
* **web:** documents are titled by company and role ([77fae8f](https://github.com/jrmatherly/career-ops/commit/77fae8f9f2fb30bf0642f98496d07d329a56df30))
* **web:** download the master CV as a PDF ([b0b0686](https://github.com/jrmatherly/career-ops/commit/b0b06862b8c5ea2664c6908c45b9e688d4b4efe9))
* **web:** every page on the shared layout (deployment config review, phase 6) ([300f754](https://github.com/jrmatherly/career-ops/commit/300f754b93d90279ce2f83442eb4a0889214e54d))
* **web:** Explore keeps the scan button on the first screen ([393c9d7](https://github.com/jrmatherly/career-ops/commit/393c9d73eb1b5abbf332783c27bb4af7a8e16394))
* **web:** group the navigation and pin Settings ([204dad4](https://github.com/jrmatherly/career-ops/commit/204dad4110738b77de8c197131640923cd47154a))
* **web:** one CV page with a PDF preview, export and an attention banner ([dcf0e00](https://github.com/jrmatherly/career-ops/commit/dcf0e00ad2b09856eaedea58bb75fc803cc76a5e))
* **web:** one CV page with preview, export and a PDF download (deployment config review, phase 7) ([33969cc](https://github.com/jrmatherly/career-ops/commit/33969cce16897c68b818eda25b1bc1a8403e7fbe))
* **web:** one page shell and header for every page ([7ad8dd9](https://github.com/jrmatherly/career-ops/commit/7ad8dd971f07ed2a115e8ae42ad4f009fce791fc))
* **web:** one page shell, grouped navigation and one time format ([4a1c892](https://github.com/jrmatherly/career-ops/commit/4a1c892c879c910a4699e82daca1c50873a0ff00))
* **web:** Portals can be searched and filtered, and keeps its last health check ([7fb6ed0](https://github.com/jrmatherly/career-ops/commit/7fb6ed000ef32f3b91fe59e028ff5b227f0ca885))
* **web:** scheduled scans show schedule and last run at a glance ([57e4ea4](https://github.com/jrmatherly/career-ops/commit/57e4ea46575a496161835aecb3da6baf3dec103a))
* **web:** Settings has a section list and one save bar ([3797557](https://github.com/jrmatherly/career-ops/commit/379755724b32b28075ac9ec90cf8956e2b612bb0))
* **web:** the board sorts by score and the funnel shows current counts ([0fee653](https://github.com/jrmatherly/career-ops/commit/0fee6534beb61cfdb0e81dc4713c0f6cde8a7fc0))
* **web:** the evaluation's finished event reports its score ([9dd9d23](https://github.com/jrmatherly/career-ops/commit/9dd9d2343546320ecb6880c2dda22d407ed23c95))
* **web:** the pipeline inbox starts at the top and labels estimates ([fcaa600](https://github.com/jrmatherly/career-ops/commit/fcaa6002b54c911b08dd034a77785630bd4e02e2))
* **web:** the scheduled drain renders a CV at the automatic CV score and marks gated roles ([7f58f71](https://github.com/jrmatherly/career-ops/commit/7f58f714404a45b7bb660994de32aa34f7e57886))
* **web:** the scheduled drain renders a CV for roles at the automatic CV score ([61b1536](https://github.com/jrmatherly/career-ops/commit/61b153683dab99ef038cc5ba493ce8e29aba3155))
* **web:** Today shows counts as tiles and state on each role ([db8fd5e](https://github.com/jrmatherly/career-ops/commit/db8fd5ee4776ac892ec6743bc62569c7c869a737))


### Bug Fixes

* **resume:** a malformed paragraphs value stops the render, and the review's test gaps are closed ([4e25da4](https://github.com/jrmatherly/career-ops/commit/4e25da40005cd4c4ea359afd1d89d1365a5be73a))
* **resume:** a paragraph after bullets keeps its cv.md place, and every cv.md writer holds the resume lock ([1cbbf34](https://github.com/jrmatherly/career-ops/commit/1cbbf34f4db217f4c64a3a28ee16f23cf0658e8b))
* **resume:** a section layout that is not a string is dropped, and Print waits for a structured save's re-read ([1406b66](https://github.com/jrmatherly/career-ops/commit/1406b664a1980ccdc5026deda0f1a11c1e713f77))
* **resume:** a structured save also checks the data/resume.json revision, so a change cv.md does not show is not overwritten ([ae77440](https://github.com/jrmatherly/career-ops/commit/ae77440372a98af4ca7cf0bd1bf7531490e20bb4))
* **resume:** add-entry takes the resume lock for a cv.md addition, and the cv route answers 503 only on a lock timeout ([d159f04](https://github.com/jrmatherly/career-ops/commit/d159f04de77162cbce57351354bc69b667d6e7e4))
* **resume:** adopt, import and the markdown editor write cv.md under the resume lock ([81eefe9](https://github.com/jrmatherly/career-ops/commit/81eefe9b215339b1752e0ea18cd5eac38a9f77ca))
* **resume:** cv.md keeps paragraph order, a structured save cannot overwrite a newer cv.md, and the CV page shows the PDF page-limit warning ([f361d51](https://github.com/jrmatherly/career-ops/commit/f361d51e2448abaf47ec680ead878ae7b6a6846f))
* **resume:** the web cv.md save always takes the resume lock ([f23b89a](https://github.com/jrmatherly/career-ops/commit/f23b89a556da6ba3811fb05bb2558956c916e22e))
* **resume:** the web cv.md save waits five seconds for the lock in total, not per holder ([8f28adc](https://github.com/jrmatherly/career-ops/commit/8f28adc9f902e3251ec97e32e081549be5587143))
* **web:** a conflict ends when cv.md returns to the tab's text, and the banner keeps its line to saved text ([4c4b92c](https://github.com/jrmatherly/career-ops/commit/4c4b92c77be80526a92f8d764cfa093ac67d9531))
* **web:** a page-limit header that will not decode does not read as a failed download ([9924b2c](https://github.com/jrmatherly/career-ops/commit/9924b2cbb70ef181689b805b81f60ac6b23f34ca))
* **web:** a page-limit header that will not decode still warns in plain words ([29ce016](https://github.com/jrmatherly/career-ops/commit/29ce0164acc7adc186240849a016891edb9d261a))
* **web:** a Portals switch hands focus on, and a qualified remote role keeps its country ([ed1fbb5](https://github.com/jrmatherly/career-ops/commit/ed1fbb591f19e49aba64c6021f0b0bf5d0c13fcf))
* **web:** a queue row with no tracker match keeps its report number ([905839c](https://github.com/jrmatherly/career-ops/commit/905839cbd8dd25e6d5eb077a47fc607adefbcd84))
* **web:** a role the drain gated is marked in the inbox and sorts last ([95b435e](https://github.com/jrmatherly/career-ops/commit/95b435e33143bcc01be428e493a6b437ab798238))
* **web:** a runner log that refuses a write is not handed to the runner ([0e5c857](https://github.com/jrmatherly/career-ops/commit/0e5c8570bb017fabffaed5ee48d76767619f0b0f))
* **web:** a stale usage read fits the sidebar row ([1489f74](https://github.com/jrmatherly/career-ops/commit/1489f744dc18e5dce2400a3e4714d5edbc93c561))
* **web:** an empty Machine Summary scalar no longer reads the next line ([21501d0](https://github.com/jrmatherly/career-ops/commit/21501d075c7ba1226aef60d6c9864faef05158ab))
* **web:** docked tabs and the sidebar respect a landscape phone's insets ([5223ed0](https://github.com/jrmatherly/career-ops/commit/5223ed0f490349081ff72792712bbcb3b4dd6678))
* **web:** Export names unsaved structured edits, and a failed re-read of the editor's own save is not a conflict ([b7b4eef](https://github.com/jrmatherly/career-ops/commit/b7b4eefc3d4df812da2f6a79fd3249aff9369471))
* **web:** hosted installs describe themselves as hosted ([a212d4e](https://github.com/jrmatherly/career-ops/commit/a212d4ed2b8d182dd337b89c053e98a78599181b))
* **web:** keep the report's free text out of the tracker notes ([e5dae46](https://github.com/jrmatherly/career-ops/commit/e5dae46bc8a143b58b565ec9bea01155ee60491d))
* **web:** keep the runner's stderr and lead tracker notes with the decision ([94927ce](https://github.com/jrmatherly/career-ops/commit/94927ce11fffe48b54063ed66b9cd50e594bd6e0))
* **web:** keep the scheduled runner's stderr in scheduled-jobs.log ([cffafe1](https://github.com/jrmatherly/career-ops/commit/cffafe1d50543fca982a0ce05b210fb584560a0b))
* **web:** last pre-push review fixes for the CV page ([ea14097](https://github.com/jrmatherly/career-ops/commit/ea140978d589a3ef45e6e9b4a922e4c05a114503))
* **web:** lead an evaluation's tracker notes with its decision ([8b39a78](https://github.com/jrmatherly/career-ops/commit/8b39a7852c7c6fe85a102791af171203e811c451))
* **web:** local review fixes for the page-by-page phase ([9c1ad5a](https://github.com/jrmatherly/career-ops/commit/9c1ad5a9322bdedc03aae2e772ea17d6c8e52d0a))
* **web:** PR review fixes for the CV page ([6e18d6c](https://github.com/jrmatherly/career-ops/commit/6e18d6c1d7e10dbc494b9ac281998c287d1823cb))
* **web:** PR review fixes for the page-by-page phase ([142b6e1](https://github.com/jrmatherly/career-ops/commit/142b6e17a534e7527d815bd19b1cf2ee4d73ef9f))
* **web:** PR review fixes for the web shell phase ([061a358](https://github.com/jrmatherly/career-ops/commit/061a3587b60e5bb9c487bf5505c9f72202002d71))
* **web:** pre-push review fixes for the CV page ([4a7b914](https://github.com/jrmatherly/career-ops/commit/4a7b9149716f1c1a9c989318f258db86c054489a))
* **web:** review fixes for the CV page and its PDF route ([0c6647e](https://github.com/jrmatherly/career-ops/commit/0c6647ef173a3e63f2b56a4526e6513281c848e4))
* **web:** review fixes for the hosted copy phase ([24f9c74](https://github.com/jrmatherly/career-ops/commit/24f9c74f2bec1897dce93310446b8217ad7e36d0))
* **web:** review fixes for the page-by-page phase ([2bb5063](https://github.com/jrmatherly/career-ops/commit/2bb50631184e73b6ac9a29804d65f26868d61460))
* **web:** review fixes for the web shell phase ([7ed38c2](https://github.com/jrmatherly/career-ops/commit/7ed38c2efe80a948327374961e161c5beafe49fa))
* **web:** second local review round for the page-by-page phase ([10d4796](https://github.com/jrmatherly/career-ops/commit/10d4796331ef7441d2195cf57971f4e2c125796b))
* **web:** the app knows it is hosted ([706c0a5](https://github.com/jrmatherly/career-ops/commit/706c0a56a68d57b7f773b57c205bbc98815916f3))
* **web:** the apply-line tile filters to its count, and a write discards older polls ([7bf305a](https://github.com/jrmatherly/career-ops/commit/7bf305a8b243ed2efddfbd78f74c8b62a8ab79e4))
* **web:** the apply-line tile opens the evaluated roles it counts ([2400dc3](https://github.com/jrmatherly/career-ops/commit/2400dc324516bb17ff645c149424a1a5a5de482a))
* **web:** the CV page shows the page-limit warning after a PDF download that ran over ([d6fa24c](https://github.com/jrmatherly/career-ops/commit/d6fa24cbb7438b706de673f82ba3f79ba2b2ccb2))
* **web:** the CV page's upload button says Upload Resume ([ea785f0](https://github.com/jrmatherly/career-ops/commit/ea785f0a2c02e935b4af63da17b64e40de7cc49f))
* **web:** the CV page's upload button says Upload Resume ([c6a922f](https://github.com/jrmatherly/career-ops/commit/c6a922f75e0971ec248c075930e96d37157a0b50))
* **web:** the drain logs the warnings of a CV run it started ([5d7a288](https://github.com/jrmatherly/career-ops/commit/5d7a2887496d804687dfa98480f0518003d6256f))
* **web:** the drain's CV run takes the Read denies an unattended run needs ([d5ecea2](https://github.com/jrmatherly/career-ops/commit/d5ecea2bc1d0385b20a42f0df7b0fd3902f86a0d))
* **web:** the evaluate queue names the company and role ([1d98358](https://github.com/jrmatherly/career-ops/commit/1d98358e83356b1d168318c9bdf9b56c4ae91603))
* **web:** the grouped sidebar fits more of its links at 900px tall ([24dbbea](https://github.com/jrmatherly/career-ops/commit/24dbbeabf6f1224330fc88f7a280ca087ed21dd9))
* **web:** the lane toggle runs on Safari 16, and a More tab takes focus as it joins the row ([d362538](https://github.com/jrmatherly/career-ops/commit/d3625389e7d1c80505c6a51c45e8855ca010f537))
* **web:** the markdown editor re-reads cv.md after every save ([9e91372](https://github.com/jrmatherly/career-ops/commit/9e9137234e11ebc3dbe3dca3df6b79dbed004327))
* **web:** the PDF download honors the profile, and review fixes for the cv.md reader ([c1cd1e0](https://github.com/jrmatherly/career-ops/commit/c1cd1e039ddcdf97bc65b7308579b8540ae4f9d8))
* **web:** the sidebar Usage line shows both windows at 100% without clipping ([f0f4940](https://github.com/jrmatherly/career-ops/commit/f0f49402af423dd6941a8fbea9a4e0fb2ebccf74))
* **web:** the sidebar Usage line shows both windows at 100% without clipping ([f2bf7c4](https://github.com/jrmatherly/career-ops/commit/f2bf7c404937ba79dfbf94c5dff61a36a45323e2))
* **web:** the usage meter ignores a zero budget and back-to-top clears Ask on touch ([51d08ca](https://github.com/jrmatherly/career-ops/commit/51d08caad710a17b63d17dee7d00e0da6260ce4d))

## [1.1.2](https://github.com/jrmatherly/career-ops/compare/web-v1.1.1...web-v1.1.2) (2026-11-11)


### Bug Fixes

* **web:** an idle drain pass clears a limit message it no longer holds ([210f154](https://github.com/jrmatherly/career-ops/commit/210f1544a78ff8934426ab3239a814e366405ae3))
* **web:** clear a drain reason left on a run with no row still waiting ([a87e636](https://github.com/jrmatherly/career-ops/commit/a87e636d987875af8ada1c7a2a4f5b92d4d85ac3))
* **web:** keep the drain's limit messages true past their pass ([44e0f12](https://github.com/jrmatherly/career-ops/commit/44e0f12b2fb9da5f02ba9f2d1bdcca53efb0bcd4))
* **web:** name a drain's stop on every run it leaves waiting ([2cabb90](https://github.com/jrmatherly/career-ops/commit/2cabb9051c8b65e59e726e73b07a600da23b6bb9))
* **web:** name the limit that leaves evaluate rows queued on their run ([f21c158](https://github.com/jrmatherly/career-ops/commit/f21c15860c66e5e3e9f52ca46e68d62134fc5782))
* **web:** name the limit that leaves evaluate rows queued on their run ([c69fbcd](https://github.com/jrmatherly/career-ops/commit/c69fbcd37e0aceaac1f634770e360659008faf7f))

## [1.1.1](https://github.com/jrmatherly/career-ops/compare/web-v1.1.0...web-v1.1.1) (2026-11-11)


### Bug Fixes

* **web:** name a failed drain on the right run ([57168d5](https://github.com/jrmatherly/career-ops/commit/57168d56dfd0c85e2d6c874ff683adb36726c188))
* **web:** put a between-rows drain failure on the last run written ([9721875](https://github.com/jrmatherly/career-ops/commit/972187550a0db7706d7c55c7fa1db2a2f6f80f05))
* **web:** record a drain that throws on its scheduled run ([ee89cd1](https://github.com/jrmatherly/career-ops/commit/ee89cd1bfb3f5067ba6d599375d5fd1e06aa9e5f))
* **web:** record a drain that throws on its scheduled run ([0992656](https://github.com/jrmatherly/career-ops/commit/0992656b6625e183ebdbed78c4cc304dde7be325))

## [1.1.0](https://github.com/jrmatherly/career-ops/compare/web-v1.0.0...web-v1.1.0) (2026-11-11)


### Features

* Inbox select-all and a doctor warning for a missing data root ([b565c7d](https://github.com/jrmatherly/career-ops/commit/b565c7d1350c42710c063439ddb879d4a861ba23))
* **portals:** turn a tracked company on or off from the Portals page ([e18147d](https://github.com/jrmatherly/career-ops/commit/e18147d63710c9ac6b6afb44612841862d4da328))
* **settings:** apply saved settings over the environment in every reader ([6581b36](https://github.com/jrmatherly/career-ops/commit/6581b360077836a17d7103ce1ec53d2fed68782f))
* **settings:** apply saved settings over the environment in every reader ([8d2e1d2](https://github.com/jrmatherly/career-ops/commit/8d2e1d279313b8a91a3242669bac4eabe47d3326))
* **settings:** company switches, model runners and plugin status ([ff2300a](https://github.com/jrmatherly/career-ops/commit/ff2300a4f575ec4a9e0ea7ccd2fb689a15ed77b3))
* **settings:** edit top-level profile and portals keys without losing comments ([2ee0cbc](https://github.com/jrmatherly/career-ops/commit/2ee0cbca8a8b83fda523d7e1327d55c1afcafe2a))
* **settings:** plugin status on the Settings page ([4b58534](https://github.com/jrmatherly/career-ops/commit/4b585342e80eab702d465b93f8d1325fd39f0669))
* **settings:** profile preferences and scan filters on the Settings page ([f994c30](https://github.com/jrmatherly/career-ops/commit/f994c30041e8509c0f4bbdc930a58d535753b62e))
* **settings:** profile preferences and scan filters on the Settings page ([9cf58c5](https://github.com/jrmatherly/career-ops/commit/9cf58c50130ada4895d0e6ba855845e4a7c4cd9f))
* **settings:** save profile and portals settings from /api/settings ([bdae8ff](https://github.com/jrmatherly/career-ops/commit/bdae8ff94b7153e4d34aa3df8275a5b9e617c704))
* **settings:** Settings page and /api/settings (Settings UI PR 2 of 4) ([66ae715](https://github.com/jrmatherly/career-ops/commit/66ae71526280b75b506c4809accfd9a5774f0729))
* **settings:** Settings page and /api/settings for saved environment settings ([834e066](https://github.com/jrmatherly/career-ops/commit/834e06685748ca664fcd04236bc4767eb4248110))
* **web:** select every listed inbox row at once ([47a13cd](https://github.com/jrmatherly/career-ops/commit/47a13cd361f83188af6c1ed179ae304107ce1701))


### Bug Fixes

* **path-resolver:** compare whole path segments when checking for a plugin copy ([557f7ed](https://github.com/jrmatherly/career-ops/commit/557f7ed96315ccd2b68068a794bc46fc4bfece3c))
* **path-resolver:** say what removing a refused override falls back to ([42b8eb7](https://github.com/jrmatherly/career-ops/commit/42b8eb7c5ed22722e7f3775c8c608f9fa174b88d))
* **portals:** keep focus on a pending switch, and show what a plugin can reach before it is turned on ([bf24beb](https://github.com/jrmatherly/career-ops/commit/bf24beb0c50d5b4aef3052ff63619652ac256e4e))
* **settings:** act on the PR review of the saved-settings overlay ([b5fb1c8](https://github.com/jrmatherly/career-ops/commit/b5fb1c881603b50b470d81e7190021244fb289ad))
* **settings:** call the page Settings wherever the dashboard names it ([e23a67f](https://github.com/jrmatherly/career-ops/commit/e23a67f4e88c2662de8b72cb4c119bd557b13994))
* **settings:** find the Settings page in the command palette by its path ([61c2d93](https://github.com/jrmatherly/career-ops/commit/61c2d930d8818d7ccf693f91e54caa7ba2342152))
* **settings:** keep line endings, switch an entry whose enabled comes first, and report a broken plugins.yml ([f2f336d](https://github.com/jrmatherly/career-ops/commit/f2f336d0834deae92a7a74b6aea775e6d4cbfe06))
* **settings:** keep list entries, their comments and their place when a list is saved ([16d38bf](https://github.com/jrmatherly/career-ops/commit/16d38bf69de7cb3eced6283d92a8166d5a7ac485))
* **settings:** leave a list the page cannot show to the file, and say why a field cannot be cleared ([fe33123](https://github.com/jrmatherly/career-ops/commit/fe33123d9bc4f719a3734d30faacf62f6a4fc69e))
* **settings:** report failed saves and unreadable files, and keep a mistyped number from resetting ([5486f84](https://github.com/jrmatherly/career-ops/commit/5486f84e80a337351a4359c27be446dc6c475bb6))
* **web:** a limit stop leaves the row queued with its retries ([ec38d13](https://github.com/jrmatherly/career-ops/commit/ec38d137fc47fa9379b6d2ce3f246ec3c5563a62))
* **web:** a row that times out on its last try leaves no stop reason behind ([4b86d68](https://github.com/jrmatherly/career-ops/commit/4b86d689e3dc873b33547037fdfc1e7298327a62))
* **web:** a run cut off at the time limit stops the evaluate drain ([5bb285c](https://github.com/jrmatherly/career-ops/commit/5bb285c34165b9beeb97c609f8f38530ebed1571))
* **web:** a tick that only re-queues a row keeps the drain's stop reason ([3044cd4](https://github.com/jrmatherly/career-ops/commit/3044cd49462b66c56789cbbc1c8fe1cead7485b2))
* **web:** a timed-out evaluation stops the drain, and the run history says why a batch stopped ([82b6ab8](https://github.com/jrmatherly/career-ops/commit/82b6ab8c4285d220ed2abd32a61deeadb998d353))
* **web:** an offline tick names itself on the run every time ([472ab2c](https://github.com/jrmatherly/career-ops/commit/472ab2c687c633a105bc177eadfebf8c7874ed58))
* **web:** bulk inbox actions never reach a row a filter hid ([a3c7f20](https://github.com/jrmatherly/career-ops/commit/a3c7f209ab9cd6b01859c71c62da6026d3386f26))
* **web:** bulk inbox actions read the listed rows ([7115108](https://github.com/jrmatherly/career-ops/commit/711510846589a08ee6829d128e8e3f5148b069d1))
* **web:** find a page in the command palette by its full path ([7d035b8](https://github.com/jrmatherly/career-ops/commit/7d035b8319f386a815bb9e6353f1ef4cc47ea191))
* **web:** only a finished evaluation or an empty run clears the drain's stop reason ([8dc3efe](https://github.com/jrmatherly/career-ops/commit/8dc3efed4b09881e7895c3a7a1f3104c2f1f8db7))
* **web:** render the resolver's own refusal text and test the screen in a browser ([c6fca23](https://github.com/jrmatherly/career-ops/commit/c6fca230e86d8554395bedf91a4c03801333b7be))
* **web:** resolve the data root to ~/career-ops-data on a plugin install ([5f279bc](https://github.com/jrmatherly/career-ops/commit/5f279bc2b6935b38799bad290b32d219927bedde))
* **web:** resolve the data root to ~/career-ops-data on a plugin install ([8d535e8](https://github.com/jrmatherly/career-ops/commit/8d535e8f16f77860b7b128464975d23f1040e640))
* **web:** show why a data root was refused, and give server errors a page ([e6ad3d6](https://github.com/jrmatherly/career-ops/commit/e6ad3d63326367bf8476ab61a38f3150341adf42))
* **web:** show why a data root was refused, and give server errors a page ([62ece74](https://github.com/jrmatherly/career-ops/commit/62ece747f3c9262c92ece0056123e52c7603c543))
* **web:** show why an evaluate drain stopped on its scheduled run ([e72d855](https://github.com/jrmatherly/career-ops/commit/e72d855e4769aa1fbe12ceb1c72941a500ec748c))
* **web:** stop the drain when a gateway's seats are all cooling down ([3287991](https://github.com/jrmatherly/career-ops/commit/32879913914e7f814f9bf234d3d4b29c97a4735c))
* **web:** stop the drain when a gateway's seats are all cooling down ([2a44fd9](https://github.com/jrmatherly/career-ops/commit/2a44fd9f0355a0ff1f5f567a51aba3bc81ea3a8b))
* **web:** uncheck an inbox row when a filter hides it ([6e04894](https://github.com/jrmatherly/career-ops/commit/6e04894f273547b2f546f0e4d41eb948cd5e1b92))

## [1.0.0](https://github.com/jrmatherly/career-ops/compare/web-v0.17.0...web-v1.0.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* **release:** the fork versions itself on its own line from here on. VERSION, the plugin manifests and the marketplace file move to 2.x and the web component to 1.x; upstream's 1.x numbers no longer describe this repository's releases, and the updater's default channel follows the fork's GitHub Releases instead of answering 404.

### Features

* **shares:** link and theme publish key management ([a973230](https://github.com/jrmatherly/career-ops/commit/a9732307bfcb7ba7e0f530f34845d2ccd5bf4b8b))
* **shares:** link and theme publish key management ([7f9b5ce](https://github.com/jrmatherly/career-ops/commit/7f9b5ce4ace600bb25bec182577e274f3e9f29ae))
* **web:** add design, template, pairing and adoption panels to the resume editor ([a283dbc](https://github.com/jrmatherly/career-ops/commit/a283dbcbc2d1afc30e4920b0d37c198ee401c207))
* **web:** add design, template, pairing and adoption panels to the resume editor ([5aa23bc](https://github.com/jrmatherly/career-ops/commit/5aa23bc18da3dad43465f8eca2ac7f1b2254a91f))
* **web:** add healthz, external scheduler status and navigation-safe origin guard ([5a69765](https://github.com/jrmatherly/career-ops/commit/5a6976579516887dea629480ed36844c1fab0695))
* **web:** add healthz, external scheduler status and navigation-safe origin guard ([732cc14](https://github.com/jrmatherly/career-ops/commit/732cc1481613c317c11f3483318846ea8ecc8994))
* **web:** add the application board and detail sheet ([732cebb](https://github.com/jrmatherly/career-ops/commit/732cebb40b5891125107966ba5bee52ce978aa86))
* **web:** add the application board and detail sheet (PR-10) ([56c6a24](https://github.com/jrmatherly/career-ops/commit/56c6a24521a9c55c4aeb83d99dd60ba97b07ce86))
* **web:** add the evaluate-text run kind with no network tool ([cedf954](https://github.com/jrmatherly/career-ops/commit/cedf9543a085d21612a9995cc3d3e83e7e7395f8))
* **web:** add the evaluate-text run kind with no network tool ([84e5983](https://github.com/jrmatherly/career-ops/commit/84e5983eb0682e9095f33c74c9d6d8692f37da54))
* **web:** add the resume editor core with live preview ([f05b1a4](https://github.com/jrmatherly/career-ops/commit/f05b1a426ab41a4c47bd7630517b2274cd404c24))
* **web:** add the resume editor core with live preview (PR-06) ([987459e](https://github.com/jrmatherly/career-ops/commit/987459e12d58b0ef30f2e7c3164e675016afbd9e))
* **web:** add the shares page ([e96c832](https://github.com/jrmatherly/career-ops/commit/e96c8324bd8f41a25daa3ae58263e4ee5cd3ab67))
* **web:** add the shares page (PR-14) ([e1a2f7d](https://github.com/jrmatherly/career-ops/commit/e1a2f7df3578bb04d0905467d174f531ba2a0c3f))
* **web:** finish the scheduled-job rank pass ([5978459](https://github.com/jrmatherly/career-ops/commit/59784594741f5a64db0d2a039d466d13882b4c14))
* **web:** let a scheduled job use portals.yml filters ([6fb1403](https://github.com/jrmatherly/career-ops/commit/6fb1403bea525cc5aaac16a6b66362e64e15acc8))
* **web:** let a scheduled job use portals.yml filters ([38e86d5](https://github.com/jrmatherly/career-ops/commit/38e86d5c4bc2c4c6a2d349cd34bdb3589ffaff5b))
* **web:** pin Check findings in the resume preview ([8dbe96d](https://github.com/jrmatherly/career-ops/commit/8dbe96d5795d851666452dad0cdcb42c3c5614e0))
* **web:** pin Check findings in the resume preview ([84dcdd8](https://github.com/jrmatherly/career-ops/commit/84dcdd802f73eecf9dcfc5a3cc95dc89f29dad2f))
* **web:** queue and drain auto-mode candidates through the dashboard ([20a5328](https://github.com/jrmatherly/career-ops/commit/20a53283767daf0c3809240d85f2f1964a28b217))
* **web:** queue and drain auto-mode candidates through the dashboard ([48bd740](https://github.com/jrmatherly/career-ops/commit/48bd740f2104e4b904e680dc81bf47584df2ebf7))
* **web:** rank each scheduled job's new rows after a scan ([5505a54](https://github.com/jrmatherly/career-ops/commit/5505a546460f64a9170ada89422d1d6b47b0d2ed))
* **web:** render a CV payload deterministically and add design variables ([85745a7](https://github.com/jrmatherly/career-ops/commit/85745a78936360691a42f3085755f7922624329e))
* **web:** render a CV payload deterministically and add design variables ([16bb9f0](https://github.com/jrmatherly/career-ops/commit/16bb9f08ec9a0b46b3111597557bbf770d804d72))
* **web:** show evaluate settings and outcomes on Scheduled scans ([8a9dcc7](https://github.com/jrmatherly/career-ops/commit/8a9dcc768c74a0c35dec0dd017cfe27ccd40e6ad))
* **web:** show evaluate settings and outcomes on Scheduled scans ([ddcbb18](https://github.com/jrmatherly/career-ops/commit/ddcbb18ec561449aa0e78a22aa134960349d21e0))
* **web:** show rank and scan-date grouping in the Inbox ([aafbfdd](https://github.com/jrmatherly/career-ops/commit/aafbfddb4a79a414bd9519e0b170565113e93698))
* **web:** show rank and scan-date grouping in the Inbox ([a64d71a](https://github.com/jrmatherly/career-ops/commit/a64d71af0aaf2efaf1d4b4aaa101e77b1dbcbbba))


### Bug Fixes

* **cv-render:** reach body text with line_height and text_color, harden the route ([611ae52](https://github.com/jrmatherly/career-ops/commit/611ae52885cef5fc57b61d426d275dddd98aff33))
* **dedup:** keep one row for one posting ([#6602](https://github.com/jrmatherly/career-ops/issues/6602)) ([a0e4f0a](https://github.com/jrmatherly/career-ops/commit/a0e4f0afe53a94883105f61fa92d29f42f11d80f))
* **path-resolver:** default a fresh root to the data/ tracker layout ([9c4466e](https://github.com/jrmatherly/career-ops/commit/9c4466ed948326d5d7aa07405db172a3d0f3adff))
* **shares:** cap a long pull toast's height and pin the refresh after an unreadable response ([b19a810](https://github.com/jrmatherly/career-ops/commit/b19a810bdcc512e1d672a1848e5c4dd6ad93311c))
* **shares:** clear the last toast when a new pull starts ([5c995e6](https://github.com/jrmatherly/career-ops/commit/5c995e6a846ab8681f1176d4628f9d688360fb48))
* **shares:** harden the publish key link and say where PUBLISH_URL is set ([ddb984c](https://github.com/jrmatherly/career-ops/commit/ddb984c2e31f0e20f1983a35842aeb053f453ae6))
* **shares:** keep every pull toast until dismissed and refuse a malformed pull body ([1a1cea4](https://github.com/jrmatherly/career-ops/commit/1a1cea46d0124cef34862cd4db1eadab9e5cd3e9))
* **shares:** wrap long pull toasts at 42rem so they clear the sidebar ([085ad7a](https://github.com/jrmatherly/career-ops/commit/085ad7a6b5323792dd5bf25fd5cbb8b8d3a7ef79))
* **status:** map Lapsed to Discarded ([#6598](https://github.com/jrmatherly/career-ops/issues/6598)) ([3031470](https://github.com/jrmatherly/career-ops/commit/30314706aabdde3e150e27cf2554b97aad36957f))
* **tracker-path:** port the fresh-root fallback to the web and dashboard mirrors ([3fd867e](https://github.com/jrmatherly/career-ops/commit/3fd867ea01c807ef9d0a9e4970359030c16a4df2))
* **update:** decouple the fork's runtime ties from upstream ([d44e521](https://github.com/jrmatherly/career-ops/commit/d44e5219108a3b9b43d3074a0fbcbfc455de75d8))
* **web:** address PR-07 review findings ([bdbd301](https://github.com/jrmatherly/career-ops/commit/bdbd301e54e6281b832f8b9de767af3e95ad3435))
* **web:** address the PR-10 review round on the board ([f23568b](https://github.com/jrmatherly/career-ops/commit/f23568b18eaabd6b1289093e4b021d4242cc9bfb))
* **web:** address the second PR-10 review round on the board ([0598509](https://github.com/jrmatherly/career-ops/commit/0598509e460ef39accc8e42057f62df10ca3a6f5))
* **web:** check the evaluate-text data root after the CLI rules ([cb608af](https://github.com/jrmatherly/career-ops/commit/cb608aff73b9198bfca4b4ff34499dba8c971b3a))
* **web:** close the R1 round-1 rank pass findings ([12f3ccb](https://github.com/jrmatherly/career-ops/commit/12f3ccb46462d8aa75ca3257c3c3e69ccb90b475))
* **web:** count dead drains as failures and stop text-less rows holding the plan ([2e4fb6a](https://github.com/jrmatherly/career-ops/commit/2e4fb6a7bad3b69db690a3536d583386c5a56794))
* **web:** count drain starts against the cap and deadline each evaluation ([e7b5ecb](https://github.com/jrmatherly/career-ops/commit/e7b5ecb625490581be34ad53e936656ce97ed466))
* **web:** count each Claude message once in the usage meter ([#6558](https://github.com/jrmatherly/career-ops/issues/6558)) ([a8edc16](https://github.com/jrmatherly/career-ops/commit/a8edc166cc9f93816e18ce6cce6824f766a4af64))
* **web:** date an Inbox row from its latest scan add ([6a946d4](https://github.com/jrmatherly/career-ops/commit/6a946d4ac619edd25048d45b83984ee39b76d874))
* **web:** fail closed without a path and touch the tick only for an external scheduler ([6ce115d](https://github.com/jrmatherly/career-ops/commit/6ce115d9179bdc9aec2d9be06381d310bf39ef69))
* **web:** forward the ranker's stdout too when a pass leaves sent rows unranked ([312db8b](https://github.com/jrmatherly/career-ops/commit/312db8b65c36572ebe88e19003e9fda3802ac1ea))
* **web:** guard resume pairing against the absorb report and harden adopt ([0496144](https://github.com/jrmatherly/career-ops/commit/0496144c76b74998a5733eb96ad30ee661759550))
* **web:** hand orphaned queue rows to a live auto job and name the limit that stopped a drain ([5db651f](https://github.com/jrmatherly/career-ops/commit/5db651f9eaf532617b2ff62b4a03a67524107385))
* **web:** harden the resume editor after PR review ([5d80700](https://github.com/jrmatherly/career-ops/commit/5d8070012f0099e388709d4cdaab1fc631d19d75))
* **web:** hide only the lists in file mode and name the list a refusal read ([c646491](https://github.com/jrmatherly/career-ops/commit/c646491274376296ea261bfd043969f17f4e4c4d))
* **web:** import the healthz route by file URL so the test runs on Windows ([5010072](https://github.com/jrmatherly/career-ops/commit/5010072d9d4d5abe23cd608dda0572e5fa297492))
* **web:** keep caller input out of the delay proxy's 502 body ([6b826b9](https://github.com/jrmatherly/career-ops/commit/6b826b9946020ef1408d613cd1e6bd75a1af72cc))
* **web:** keep the sidebar clear of the Ask button with the Board entry ([301ab27](https://github.com/jrmatherly/career-ops/commit/301ab274cbf643b21dff18fbfdb1774cf3056acf))
* **web:** open the Studio from the HTML path stored in pdf-index ([#6550](https://github.com/jrmatherly/career-ops/issues/6550)) ([da64912](https://github.com/jrmatherly/career-ops/commit/da6491238330b035df86a25b7ea327cbdf7b01cc))
* **web:** read a large evaluate ledger, label a hand-edited Auto job, show the rank caveat for Review ([163b066](https://github.com/jrmatherly/career-ops/commit/163b066aae95a9166f3bc3e25743b8560f3076e2))
* **web:** read a large evaluate ledger, label a hand-edited Auto job, show the rank caveat for Review ([25f7ae2](https://github.com/jrmatherly/career-ops/commit/25f7ae22e9d608743b6cd8d0c501d7fdf76cb60e))
* **web:** refuse a local: evaluate input holding non-space whitespace ([c521400](https://github.com/jrmatherly/career-ops/commit/c521400fb03dc64ddcf7527a2dd8d770f049fea4))
* **web:** refuse a malformed posting URL and cliId before a run starts ([a1e4df6](https://github.com/jrmatherly/career-ops/commit/a1e4df6b4347ec0768c13c5f039a157910e411de))
* **web:** refuse a malformed run input and kind-scoped fields on the wrong kind ([fa4a6fa](https://github.com/jrmatherly/career-ops/commit/fa4a6fa220bb5c1a3741e7cd8390dac80f56a755))
* **web:** refuse a sequence portals.yml and keep the overlay's title sections mappings ([8daedb1](https://github.com/jrmatherly/career-ops/commit/8daedb199fe3b45b05494e65031087637938e7d9))
* **web:** refuse a title list the scanner reads as no limit ([58d6201](https://github.com/jrmatherly/career-ops/commit/58d6201920ec7958d28850411f6f03aa584515f0))
* **web:** refuse unknown kinds and stray jdText, resolve the deny root ([ae254e9](https://github.com/jrmatherly/career-ops/commit/ae254e9e80e9ea4c29544bedfe3d54bc71e55f7c))
* **web:** render the rank caveat for Review, name a buffer overflow, reject null settings ([f6bb86c](https://github.com/jrmatherly/career-ops/commit/f6bb86cd89d2b08acb88b13fbd4b8673cf598e5b))
* **web:** report vanished shares and key errors from the pull route ([935a750](https://github.com/jrmatherly/career-ops/commit/935a7503d50517b34ba9e1557de22bcc75a911a7))
* **web:** resume review round 2: adopt edge states, honest design copy, tests ([77b4aac](https://github.com/jrmatherly/career-ops/commit/77b4aac44649e44d53c730c910e5a90d285d5b4b))
* **web:** second resume editor review round ([c702da7](https://github.com/jrmatherly/career-ops/commit/c702da73979b8617670afe93507d75fff0c8d9f1))
* **web:** second review round on the shares page ([717e12b](https://github.com/jrmatherly/career-ops/commit/717e12bd86ac7762166b0d3f4db78a7e52eb2e05))
* **web:** send bug reports to this fork ([e94fb74](https://github.com/jrmatherly/career-ops/commit/e94fb74960caf2081c53a53ac0adff0ac077446b))
* **web:** shares errors name the environment as the first place PUBLISH_* is read ([355888a](https://github.com/jrmatherly/career-ops/commit/355888a48a9093703a04da6320cdb4e6993ecc02))
* **web:** show the CLI's own stderr when a run exits cleanly with no output ([#6579](https://github.com/jrmatherly/career-ops/issues/6579)) ([d776aa9](https://github.com/jrmatherly/career-ops/commit/d776aa917c4df689c1a031ecdc9cd75c1c10a959))
* **web:** stop evaluate-text on a non-JD and refuse a padded cliId ([aebb7eb](https://github.com/jrmatherly/career-ops/commit/aebb7eb039c6a3cc628bdb3ea6126563ab8b5b38))
* **web:** surface evaluate-queue read failures and clamp on every save path ([8d39d30](https://github.com/jrmatherly/career-ops/commit/8d39d30b49be1bcea7941f0d2582806c146c8835))
* **web:** surface the fact gate's claims and keep the rejected CV when a PDF render fails ([#34](https://github.com/jrmatherly/career-ops/issues/34)) ([d2fea89](https://github.com/jrmatherly/career-ops/commit/d2fea890e3398bd7b2b72495c8f8b61995a6b591))
* **web:** tell a cleared scan date from an empty one and keep the rank chip at AA ([8669fdd](https://github.com/jrmatherly/career-ops/commit/8669fdd473b5a10eae54155c48a443cfd41afc77))
* **web:** tighten the Inbox rank parse and explain an empty Added filter ([ecb3c7f](https://github.com/jrmatherly/career-ops/commit/ecb3c7ffcdb910333047adf6b995222b760ff44d))


### Continuous Integration

* **release:** harden the release pipeline after review; first release is 2.0.0 and web 1.0.0 ([24394d2](https://github.com/jrmatherly/career-ops/commit/24394d2cb68a603d11458f25153b551f2b9c7c1a))
