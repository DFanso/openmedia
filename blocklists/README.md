# Bundled blocklists

Filter lists compiled into the app binary and converted to Safari content-blocking rules at runtime
(see `docs/wiki/ad-blocking.md`). The app never downloads lists: they change only with an app release.

| File               | List                                           | Blocks                    |
| ------------------ | ---------------------------------------------- | ------------------------- |
| `easylist.txt`     | [EasyList](https://easylist.to/)               | Ads                       |
| `easyprivacy.txt`  | [EasyPrivacy](https://easylist.to/)            | Trackers, analytics, tags |

Each file keeps its upstream header, including `Version`, `Last modified` and `Licence`.

## License

EasyList and EasyPrivacy are dual-licensed by the EasyList authors under
[CC BY-SA 3.0 and GPLv3](https://easylist.to/pages/licence.html). They are redistributed unmodified,
as data, with attribution here. The project license is still undecided (roadmap, open question 5);
decide it with this dual license in view before the first public release.

## Updating

```bash
scripts/update-blocklists.sh
```

Review the diff, run `cargo test --manifest-path src-tauri/Cargo.toml adblock` (it checks every list
converts and stays under WebKit's 150,000-rule limit), then commit.
