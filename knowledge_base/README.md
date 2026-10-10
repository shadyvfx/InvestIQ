# Local knowledge-base storage

`sources/` contains imported source records and full text. `index.json` is
rebuilt from those records by `python -m backend.ingest_knowledge rebuild`.
Both paths are git-ignored so locally supplied, restricted, or personal
material is not accidentally added to source control.

Every source record preserves title, publisher, topic, original URL when
provided, publication date when available, retrieval date, and the user's
rights basis. Local-file publisher and URL claims are marked as unverified.
This repository does not include a downloaded corpus; add only sources you
have permission to store and use.
