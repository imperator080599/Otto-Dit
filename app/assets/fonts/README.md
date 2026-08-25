# Vendored fonts

`DejaVuSans.ttf` / `DejaVuSans-Bold.ttf` — DejaVu Sans (Bitstream Vera licence, free to
redistribute and embed). Vendored deliberately rather than read from the host: a workpaper
export must be **byte-identical on any machine**, so it cannot depend on which fonts the
operating system happens to ship.

Chosen over Liberation Sans for **coverage**, after the glyph check refused an export: the
SOX workpaper writes `⇒` (U+21D2), which Liberation Sans does not carry and which the old
renderer had been printing as `?`. The rule is that the font must cover the content, not
that the content must shrink to the font.

They replace pdf-lib's built-in Helvetica, whose WinAnsi encoding cannot represent the
characters a French audit file actually contains — typographic apostrophes, guillemets,
€, ≥, ≤ — and silently rendered them as `?` (ADR-023).
