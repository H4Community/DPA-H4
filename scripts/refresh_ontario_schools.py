"""Build the shared school directory from Ontario's pipe-separated data export."""
import csv
import json
from collections import defaultdict
from pathlib import Path
import sys

with Path(sys.argv[1]).open(encoding="utf-8-sig", newline="") as source:
    rows = csv.DictReader(source, delimiter="|")
    boards = {}
    schools = defaultdict(dict)
    for row in rows:
        if row["School Level"] not in {"Elementary", "Secondary"}:
            continue
        board_id, school_id = row["Board Number"].strip(), row["School Number"].strip()
        if board_id and school_id:
            boards[board_id] = row["Board Name"].strip()
            schools[board_id][school_id] = [row["School Name"].strip(), row["City"].strip()]

directory = {
    board_id: [name, dict(sorted(schools[board_id].items(), key=lambda item: item[1]))]
    for board_id, name in sorted(boards.items(), key=lambda item: item[1])
}
output = Path(__file__).resolve().parents[1] / "data" / "ontario-schools.js"
output.write_text(
    "// Ontario public school contact information · Open Government Licence – Ontario\n"
    "// https://data.ontario.ca/dataset/ontario-public-school-contact-information\n"
    "const H4_SCHOOL_DIRECTORY = " + json.dumps(directory, ensure_ascii=True, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"{len(boards)} boards, {sum(map(len, schools.values()))} schools")
