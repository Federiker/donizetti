# donizetti_pdf

SVG pages to one PDF: `svg_pages_to_pdf(&pages)` makes a page of each SVG, the
size of its `width` and `height` (CSS pixels, 96 to the inch, as
OpenSheetMusicDisplay writes them; a 200 × 100 px page is 150 × 75 pt). Each
page is converted by [svg2pdf](https://github.com/typst/svg2pdf) (MIT or
Apache-2.0) after [usvg](https://github.com/linebender/resvg) has read it, so
the music stays vector and the text is real, selectable text.

Text (titles, lyrics, chord symbols) is drawn with the computer's fonts, read
once (`system_fonts()`); the generic serif and sans-serif families point at
fonts that are there, so a family the computer lacks falls back to one it has.
`svg_pages_to_pdf_with_fonts` takes the caller's own font database instead. A
page with text on a computer with no fonts is refused (`pdf_no_fonts`) rather
than written without its words.

Errors serialise as `{ code, params }`: `pdf_no_pages`, `pdf_invalid_svg`,
`pdf_no_fonts` and `pdf_conversion_failed`, with the page (from 1) and the
reader's `detail`. Raster images (PNG, JPEG, GIF) are embedded and filtered
groups rasterised, as svg2pdf does. Tests are in `tests/unit`.
