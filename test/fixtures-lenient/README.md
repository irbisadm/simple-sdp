# Lenient parsing fixtures

Every file here is **hand-made**. None of them is a capture from a real device or
implementation; real captures belong in `../fixtures/` (see its README). Each file
contains one deviation from RFC 8866 that `sdpReader.parse` rejects or mangles and
`sdpReader.parseLenient` recovers from. The file name says which deviation it is.
Addresses are from the documentation range (RFC 5737).

Line endings are CRLF, except `cr-only-line-endings.sdp`.

The expected warnings for each file are in `test/lenient.spec.ts` ("lenient fixtures").
