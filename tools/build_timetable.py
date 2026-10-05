# Turns the two Arbor "School Timetable" exports (Week A and Week B) into one timetable doc per year,
# and writes timetable.sql to paste into the screens' Supabase SQL editor.
# Staff names are left out on purpose: the screens only show group, subject and room.
# Usage: pip install openpyxl; python3 tools/build_timetable.py WeekA.xlsx WeekB.xlsx
import openpyxl, re, json, sys
SLOTS = {'08:20 - 09:15': 'P1', '09:15 - 10:55': 'P2', '11:25 - 13:05': 'P3', '13:35 - 15:15': 'P4', '15:15 - 16:15': 'P5'}
DAYS = {'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5}
ABBR = {'Eng': 'English', 'En': 'English', 'Ma': 'Maths', 'H+SC': 'Health & Social Care', 'RS': 'RS', 'Music P': 'Music', 'IT': 'IT'}
def parse(cls, period):
    cls = cls.strip()
    m = re.match(r'^(7|8|9|10|11)(.*)$', cls)
    if not m: return None
    y, rest = m.group(1), m.group(2).strip()
    if '/' in rest:
        g, subj = rest.split('/', 1)
        subj = re.sub(r'\(.*?\)', '', subj).strip()
        if re.fullmatch(r'P\d', subj): subj, g = g, ''
        if re.fullmatch(r'(Mon|Tue|Wed|Thr|Thu|Fri)[AB]\d', subj): g, subj = g[:1], g[1:]  # e.g. 11TEng/FriA2: an extra T-band English session
        subj = re.sub(r'(?<=[a-z])\d+$', '', subj)
        subj = ABBR.get(subj, subj)
        return y, {'group': y + g.replace(' ', ''), 'subject': subj}
    return y, {'group': y + rest.replace(' ', ''), 'subject': 'Tutor time' if period == 'P1' else ''}
out = {y: {'A': {}, 'B': {}} for y in ['y7', 'y8', 'y9', 'y10', 'y11']}
weekof = {}
for letter_, f in zip('AB', sys.argv[1:3]):
    wb = openpyxl.load_workbook(f, data_only=True)
    weekof[letter_] = str(wb['Report Information']['A3'].value).replace('\xa0', ' ')
    for r in wb['Report Data'].iter_rows(min_row=2, values_only=True):
        day, slot, cls, staff, room, susp = [str(c).replace('\xa0', ' ') if c is not None else '' for c in r]
        if susp.strip(): continue
        dname, letter = day.split()
        period = SLOTS[re.sub(r'^.*?, ', '', slot)]
        p = parse(cls, period)
        if not p: continue
        y, e = p
        e['room'] = re.sub(r'^Torquay Academy:\s*', '', room).strip()
        lst = out['y' + y][letter].setdefault(str(DAYS[dname]), {}).setdefault(period, [])
        if e not in lst: lst.append(e)
sql = []
key = lambda e: [(0, int(t), '') if t.isdigit() else (1, 0, t) for t in re.split(r'(\d+)', e['group']) if t] + [(2, 0, e['subject'])]
for y in out:
    for L in out[y]:
        for d in out[y][L]:
            for p in out[y][L][d]: out[y][L][d][p].sort(key=key)
    doc = {'source': 'arbor-export', 'weekA': weekof['A'], 'weekB': weekof['B'], 'weeks': out[y]}
    sql.append("insert into public.screen_docs (path, data) values ('timetable/%s', '%s') on conflict (path) do update set data = excluded.data, updated_at = now();" % (y, json.dumps(doc).replace("'", "''")))
    n = sum(len(v) for L in out[y].values() for d in L.values() for v in d.values())
    print(y, n, 'entries', len(json.dumps(doc)) // 1024, 'KB')
open('timetable.sql', 'w').write('\n'.join(sql) + '\n')
print('Wrote timetable.sql')
