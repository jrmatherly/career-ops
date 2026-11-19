import sys, collections, fitz
for path in sys.argv[1:]:
    doc = fitz.open(path); c = collections.Counter()
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    c[round(s["size"], 2)] += len(s["text"])
    top = c.most_common(3)
    print(path.split('/')[-1], 'pages', len(doc), 'body pt (chars):', top)
