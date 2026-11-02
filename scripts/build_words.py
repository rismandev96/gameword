import json, re, sys
from collections import defaultdict
from nltk.corpus import wordnet as wn
src, out = sys.argv[1], sys.argv[2]
STOP = set("""a an the and or but if then than of to in on at by for with from into onto upon about above below over under after before
between among through during without within against across along around behind beyond near off out up down since until till
i me my mine we us our you your he him his she her it its they them their this that these those who whom whose which what
is am are was were be been being have has had do does did will would shall should can could may might must ought
not no yes so too very also just only even still yet ever never always often again here there where when why how
all any some each every both either neither none much many more most less least few other another such own same
one two three four five six seven eight nine ten hundred thousand million billion first second third
mr mrs ms dr inc ltd co etc vs via per re
""".split())
BAD=set('fuck shit cunt bitch bastard dick cock pussy whore slut nigger nigga fag faggot asshole arse arsehole twat wank wanker prick tits tit boob boobs piss crap damn hell porn porno rape rapist dildo cum jizz spunk bollocks bugger retard zoophilia incest pedophile paedophile bestiality molester'.split())
# Bentuk V2/V3 tidak beraturan (went, broken, saw, ...) dan plural tidak beraturan (children, mice)
# diambil dari file exception WordNet, lalu dibuang semua.
import os
from nltk.data import find
WN_DIR = str(find('corpora/wordnet'))
IRREG = set()
for fn in ('verb.exc', 'noun.exc'):
    for line in open(os.path.join(WN_DIR, fn)):
        parts = line.split()
        if len(parts) >= 2 and parts[0] not in parts[1:]:
            IRREG.add(parts[0])
words = [w.strip().lower() for w in open(src)]
seen=set(); res=[]
for rank,w in enumerate(words):
    if w in seen or w in STOP or not re.fullmatch(r"[a-z]{3,12}", w): continue
    seen.add(w)
    score=defaultdict(int); syn=defaultdict(int)
    for s in wn.synsets(w):
        p = 'a' if s.pos() in ('a','s') else s.pos()
        for l in s.lemmas():
            if l.name()==w:
                syn[p]+=1; score[p]+=l.count()+1
    if not (syn['n'] or syn['v']): continue
    cands = set(wn._morphy(w, 'n')) | set(wn._morphy(w, 'v'))
    if re.search(r'(ing|ed|s)$', w) and any(c != w for c in cands): continue
    if w in IRREG: continue
    if w in BAD or w.endswith(('fuck','shit')): continue
    nv = score['n']+score['v']; aa = score['a']+score['r']
    if aa > nv: continue
    pos=''
    # mark a POS only if it is a real (non-trivial) sense: has corpus count or >=1 synsets and not negligible
    if syn['n'] and (score['n'] >= 0.15*nv or syn['n']>=2): pos+='n'
    if syn['v'] and (score['v'] >= 0.15*nv or syn['v']>=2): pos+='v'
    if not pos: pos = 'n' if score['n']>=score['v'] else 'v'
    res.append((w,pos,rank))
by=defaultdict(list)
for w,p,r in res: by[w[0]].append([w,p,r])
for k in by: by[k].sort()
json.dump({k:by[k] for k in sorted(by)}, open(out,'w'), separators=(',',':'))
print(len(res), {k:len(v) for k,v in sorted(by.items())})
