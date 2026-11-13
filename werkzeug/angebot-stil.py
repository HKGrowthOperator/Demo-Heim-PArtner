# Hängt das gemeinsame Stylesheet an jede Angebots-/Vertragsseite und setzt das Baum-Logo in den Kopf.
# Im Fließtext der Seiten steht der Kurzname „HK Growth“. Der volle Firmenname bleibt im Kopf, in der Fußzeile,
# bei Absender und Unterschrift und im Vertragstext selbst.
# Wiederholbar: ein zweiter Lauf ändert nichts mehr.
import re, sys, pathlib
wurzel = pathlib.Path(sys.argv[1])
LINK = '<link rel="stylesheet" href="/angebot/_stil/reflexion.css">'
KURZ = [('von HK Growth UG (haftungsbeschränkt) bereits unterschrieben', 'von HK Growth bereits unterschrieben'),
        ('eine Kopie geht an HK Growth UG (haftungsbeschränkt).', 'eine Kopie geht an HK Growth.')]
for f in sorted(wurzel.glob('**/index.html')):
    s = alt = f.read_text(encoding='utf-8')
    s = re.sub(r'<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*', '', s)
    if LINK not in s: s = s.replace('</head>', LINK + '</head>', 1)
    s = s.replace('<div class="logo">HK</div>', '<img class="logo baum" src="/angebot/_stil/hk-baum.png" alt="HK Growth" width="56" height="56">')
    for lang, kurz in KURZ: s = s.replace(lang, kurz)
    if s != alt: f.write_text(s, encoding='utf-8'); print('geändert', f)
    else: print('unverändert', f)
