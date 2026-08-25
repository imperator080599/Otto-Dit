# dataset/eval/public — the public half of the extraction eval corpus (ADR-018)

**Nothing in this directory is committed** (see `.gitignore`), and **no client document may
ever be placed here**. Professional secrecy and contractual obligations forbid it. An eval
on real client documents happens only at a pilot client, in that client's environment, with
written authorization — never in this repository.

What belongs here: **published, publicly available documents** you are free to process —
e.g. published annual reports, vendor sample/specimen invoices, government-published form
samples — plus your own degraded photographs of documents you own.

## How to use it

1. Drop the PDFs in this directory.
2. Write `ground_truth.json` here, in the same shape the synthetic corpus emits
   (`dataset/eval/synthetic/ground_truth.json`):

```json
[
  {
    "id": "pub-0001",
    "filename": "acme-annual-report-invoice-specimen.pdf",
    "variant": "public / vendor specimen",
    "rendering": "text_layer",
    "degradation": null,
    "truth": {
      "docType": "invoice",
      "invoiceNumber": "…",
      "invoiceDate": "2025-03-14",
      "buyerName": "…",
      "sellerName": "…",
      "totalNetCents": "123456",
      "vatCents": "24691",
      "totalGrossCents": "148147"
    }
  }
]
```

3. Run `cd app && npm run eval:extraction`. The public documents are scored alongside the
   synthetic ones and counted separately in the report header.

Fields you cannot label may be omitted from `truth` — they are skipped, not counted as
misses.
