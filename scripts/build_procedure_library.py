#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextLine
from pdfminer.pdfpage import PDFPage

CODE_RE = re.compile(r"\b([A-Z]{2}\d{3}[A-Z])\b")
SERIAL_AND_CODE_RE = re.compile(r"^(?:\d+\s+)?([A-Z]{2}\d{3}[A-Z])(?:\s+(.*))?$")
TABLE_CLASS_RE = re.compile(r"^(?:MSP|[1-7][ABC]|\d+[ABC]?|<=?\d+CC|>=?\s*\d+CC|\d+\s*-\s*\d+CC)$")
WHITESPACE_RE = re.compile(r"\s+")
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

SECTION_PAGE_RANGES = [
    (4, 12, "integumentary", "SA"),
    (13, 33, "musculoskeletal", "SB"),
    (34, 36, "respiratory", "SC"),
    (37, 44, "cardiovascular", "SD"),
    (45, 46, "hemic_lymphatic", "SE"),
    (47, 59, "digestive", "SF"),
    (60, 64, "urinary", "SG"),
    (65, 67, "male_genital", "SH"),
    (68, 75, "female_genital", "SI"),
    (76, 76, "endocrine", "SJ"),
    (77, 83, "nervous", "SK"),
    (84, 90, "eye", "SL"),
    (91, 96, "ent", "SM"),
]

STOPWORDS = {
    "OF", "THE", "AND", "WITH", "WITHOUT", "OR", "TO", "FOR", "IN", "ON", "AT", "BY",
    "VARIOUS", "LESIONS", "PROCEDURE", "PROCEDURES"
}

APPROACH_MODIFIERS = {
    "ROBOTIC": "robotic",
    "ROBOT": "robotic",
    "MIS": "minimally_invasive",
    "LAPAROSCOPIC": "laparoscopic",
    "LAPAROSCOPY": "laparoscopic",
    "THORACOSCOPIC": "thoracoscopic",
    "ENDOSCOPIC": "endoscopic",
    "ENDOVASCULAR": "endovascular",
    "PERCUTANEOUS": "percutaneous",
    "TRANSCATHETER": "transcatheter",
    "OPEN": "open",
}

WITH_MODIFIER_PATTERNS = [
    (re.compile(r"\bWITH/?WITHOUT\s+CHOLANGIOGRAM\b"), "cholangiogram"),
    (re.compile(r"\bCHOLANGIOGRAM\b"), "cholangiogram"),
    (re.compile(r"\bWITH/?WITHOUT\s+BIOPSY\b"), "biopsy"),
    (re.compile(r"\bBIOPSY\b"), "biopsy"),
    (re.compile(r"\bIMAGING\s+GUIDED\b"), "imaging_guided"),
    (re.compile(r"\bULTRASOUND\s+GUID(?:ED|ANCE)\b"), "ultrasound_guided"),
    (re.compile(r"\bFLUOROSCOP(?:Y|IC)\b"), "fluoroscopic"),
    (re.compile(r"\bENDOBRONCHIAL\s+ULTRASOUND\b"), "ebus"),
]

LATERALITY_PATTERNS = [
    (re.compile(r"\bBILATERAL\b"), "bilateral"),
    (re.compile(r"\bUNILATERAL\b"), "unilateral"),
    (re.compile(r"\bLEFT\b"), "left"),
    (re.compile(r"\bRIGHT\b"), "right"),
]

COA_REQUIREMENTS = [
    # Hours and assessments
    ("coa.hour.clinical_total", "Total Clinical Hours", 2000, "hour", False),
    ("coa.assessment.preanesthetic_initial", "Initial preanesthetic assessment", 100, "assessment", False),
    ("coa.assessment.postanesthetic", "Postanesthetic assessment", 150, "assessment", False),
    # Cases and patient factors
    ("coa.case.total", "Total anesthetic cases", 750, "case", False),
    ("coa.case.asa.class_i", "ASA Class I cases", 300, "case", False),
    ("coa.case.asa.class_ii", "ASA Class II cases", 100, "case", False),
    ("coa.case.asa.class_iii_to_vi", "ASA Class III-VI cases", 100, "case", False),
    ("coa.case.asa.class_v", "ASA Class V cases", 5, "case", False),
    ("coa.case.age.geriatric_65_plus", "Geriatric (65+) cases", 200, "case", False),
    ("coa.case.age.pediatric_total", "Pediatric cases", 75, "case", False),
    ("coa.case.age.pediatric_lt2", "Pediatric < 2 years", 25, "case", False),
    ("coa.case.age.neonate_lt4w", "Neonate < 4 weeks", 5, "case", False),
    ("coa.case.emergency", "Trauma/Emergency (E)", 50, "case", False),
    # Obstetrics and pain
    ("coa.case.ob.obstetrical_management", "Obstetrical management", 40, "case", False),
    ("coa.case.ob.cesarean_delivery", "Cesarean delivery", 15, "case", False),
    ("coa.case.ob.analgesia_for_labor", "Analgesia for labor", 15, "case", False),
    ("coa.case.pain_management_encounter", "Pain management encounters", 50, "case", False),
    # Anatomic categories
    ("coa.case.anatomic.intra_abdominal", "Anatomic: Intra-abdominal", 75, "case", False),
    ("coa.case.anatomic.intracranial_total", "Anatomic: Intracranial (total)", 20, "case", False),
    ("coa.case.anatomic.intracranial_open", "Anatomic: Intracranial open", 10, "case", False),
    ("coa.case.anatomic.intracranial_closed", "Anatomic: Intracranial closed", 10, "case", False),
    ("coa.case.anatomic.oropharyngeal", "Anatomic: Oropharyngeal", 20, "case", False),
    ("coa.case.anatomic.intrathoracic_total", "Anatomic: Intrathoracic (total)", 40, "case", False),
    ("coa.case.anatomic.intrathoracic_open_heart", "Anatomic: Open heart", 10, "case", False),
    ("coa.case.anatomic.intrathoracic_closed_heart", "Anatomic: Closed heart", 10, "case", False),
    ("coa.case.anatomic.intrathoracic_lung", "Anatomic: Intrathoracic lung", 5, "case", False),
    ("coa.case.anatomic.neck", "Anatomic: Neck", 10, "case", False),
    ("coa.case.anatomic.neuroskeletal", "Anatomic: Neuroskeletal", 20, "case", False),
    ("coa.case.anatomic.vascular", "Anatomic: Vascular", 30, "case", False),
    # Methods / airway / regional / lines
    ("coa.case.anesthesia.moderate_deep_sedation", "Moderate/deep sedation", 50, "case", False),
    ("coa.case.anesthesia.general", "General anesthesia", 400, "case", False),
    ("coa.case.anesthesia.general_induction_independent", "General anesthetic induction with minimal/no assistance", 100, "case", False),
    ("coa.skill.airway.inhalation_induction", "Inhalation induction", 40, "skill", False),
    ("coa.skill.airway.mask_ventilation", "Mask ventilation", 200, "skill", False),
    ("coa.skill.airway.supraglottic_total", "Supraglottic airway devices", 50, "skill", False),
    ("coa.skill.airway.tracheal_intubation_total", "Tracheal intubation", 250, "skill", False),
    ("coa.skill.airway.alt_intubation_total", "Alternative tracheal intubation/endoscopic techniques", 50, "skill", False),
    ("coa.skill.airway.endoscopic_techniques", "Alternative airway endoscopic techniques", 15, "skill", True),
    ("coa.case.emergence", "Emergence from anesthesia", 300, "case", False),
    ("coa.skill.regional.actual_administration_total", "Regional techniques actual administration", 35, "skill", True),
    ("coa.skill.regional.spinal", "Regional spinal (actual administration)", 50, "skill", True),
    ("coa.skill.regional.epidural", "Regional epidural (actual administration)", 50, "skill", True),
    ("coa.skill.regional.peripheral_block", "Regional peripheral block (actual administration)", 50, "skill", True),
    ("coa.skill.regional.management_total", "Regional techniques management", 50, "skill", False),
    ("coa.skill.arterial.line_placement", "Arterial puncture/catheter insertion", 25, "skill", False),
    ("coa.skill.arterial.monitoring", "Intra-arterial blood pressure monitoring", 30, "skill", False),
    ("coa.skill.cvc.nonpicc_placement", "Central venous catheter placement (non-PICC)", 15, "skill", True),
    ("coa.skill.cvc.monitoring", "Central venous catheter monitoring", 15, "skill", False),
    ("coa.skill.picc.placement", "PICC placement", 5, "skill", True),
    ("coa.skill.pac.placement", "Pulmonary artery catheter placement", 5, "skill", True),
    ("coa.skill.pac.monitoring", "Pulmonary artery catheter monitoring", 10, "skill", False),
    ("coa.skill.iv.placement", "Intravenous catheter placement", 100, "skill", False),
    ("coa.skill.ultrasound.guided_total", "Ultrasound-guided techniques", 20, "skill", True),
    ("coa.skill.ultrasound.guided_regional", "Ultrasound-guided regional", 10, "skill", True),
    ("coa.skill.ultrasound.guided_vascular", "Ultrasound-guided vascular", 10, "skill", True),
    ("coa.skill.pocus", "Point of Care Ultrasound (POCUS)", 10, "skill", True),
]

SKILL_TO_COA = [
    ("airway_mask_ventilation", "coa.skill.airway.mask_ventilation", "performed_by_srna=true", "One per patient; positive pressure ventilation by mask.") ,
    ("airway_sga_lma", "coa.skill.airway.supraglottic_total", "performed_by_srna=true", "Laryngeal mask counts under supraglottic devices.") ,
    ("airway_sga_other", "coa.skill.airway.supraglottic_total", "performed_by_srna=true", "Other supraglottic device.") ,
    ("airway_intubation_oral", "coa.skill.airway.tracheal_intubation_total", "performed_by_srna=true and successful=true", "Only successful tracheal intubation counts.") ,
    ("airway_intubation_nasal", "coa.skill.airway.tracheal_intubation_total", "performed_by_srna=true and successful=true", "Only successful tracheal intubation counts.") ,
    ("airway_alt_intubation_video", "coa.skill.airway.alt_intubation_total", "performed_by_srna=true and successful=true", "Alternative technique should also map to tracheal intubation if ETT placed.") ,
    ("airway_endoscopic", "coa.skill.airway.endoscopic_techniques", "performed_by_srna=true and validation in clinical|simulated", "Simulation may satisfy part, not all.") ,
    ("regional_spinal", "coa.skill.regional.spinal", "performed_by_srna=true", "Counts only when personally performed.") ,
    ("regional_epidural", "coa.skill.regional.epidural", "performed_by_srna=true", "Counts only when personally performed.") ,
    ("regional_pnb", "coa.skill.regional.peripheral_block", "performed_by_srna=true", "Counts only when personally performed.") ,
    ("regional_other", "coa.skill.regional.actual_administration_total", "performed_by_srna=true", "Other regional techniques (truncal/cutaneous/head-neck).") ,
    ("arterial_line", "coa.skill.arterial.line_placement", "performed_by_srna=true and successful=true", "Arterial puncture/catheter insertion; unsuccessful attempts do not count.") ,
    ("arterial_monitoring", "coa.skill.arterial.monitoring", "performed_by_srna=true", "Counts when arterial line used for monitoring in case and managed by student.") ,
    ("cvc_nonpicc", "coa.skill.cvc.nonpicc_placement", "performed_by_srna=true and successful=true and line_type!=PICC", "Non-PICC only; introducer qualifies.") ,
    ("cvc_monitoring", "coa.skill.cvc.monitoring", "performed_by_srna=true", "Monitoring CVC waveforms; PAC RA pressure monitoring excluded.") ,
    ("picc", "coa.skill.picc.placement", "performed_by_srna=true and successful=true", "PICC does not count for non-PICC CVC placement.") ,
    ("pac_placement", "coa.skill.pac.placement", "performed_by_srna=true and successful=true", "PAC placement tracked separately from CVC.") ,
    ("pac_monitoring", "coa.skill.pac.monitoring", "performed_by_srna=true", "PAC monitoring category.") ,
    ("iv_peripheral", "coa.skill.iv.placement", "performed_by_srna=true and successful=true", "Peripheral IV placement.") ,
    ("us_guided_regional", "coa.skill.ultrasound.guided_regional", "performed_by_srna=true", "Regional ultrasound guidance.") ,
    ("us_guided_vascular", "coa.skill.ultrasound.guided_vascular", "performed_by_srna=true", "Vascular ultrasound guidance includes arterial/CVC/PICC/peripheral access.") ,
    ("pocus", "coa.skill.pocus", "performed_by_srna=true", "POCUS excludes ultrasound image guidance for line/block placement.") ,
]


@dataclass
class RawProcedure:
    pdf_procedure_id: str
    code: str
    raw_name: str
    source_page: int
    source_text_snippet: str
    domain: str


@dataclass
class PrimaryProcedure:
    primary_procedure_id: str
    display_name: str
    domain: str
    allowed_modifiers: set[str] = field(default_factory=set)


def page_count(pdf_path: Path) -> int:
    with pdf_path.open("rb") as f:
        return sum(1 for _ in PDFPage.get_pages(f))


def page_domain(page_num_1based: int) -> tuple[str, str] | None:
    for start, end, domain, prefix in SECTION_PAGE_RANGES:
        if start <= page_num_1based <= end:
            return domain, prefix
    return None


def clean_line(line: str) -> str:
    line = line.replace("\u2013", "-").replace("\u2014", "-").replace("\u2019", "'")
    line = WHITESPACE_RE.sub(" ", line.strip())
    return line


def should_skip_line(line: str) -> bool:
    if not line:
        return True
    upper = line.upper()
    if upper in {
        "S/N", "CODE", "DESCRIPTION", "TABLE CLASSIFICATION", "TABLE OF SURGICAL PROCEDURES",
        "GUIDELINES ON MEDISAVE AND MEDISHIELD LIFE CLAIMS FOR SURGICAL PROCEDURES",
        "ANNEX",
    }:
        return True
    if upper.startswith("COA GUIDELINES FOR COUNTING CLINICAL EXPERIENCES"):
        return True
    if re.fullmatch(r"\d+", upper):
        return True
    if TABLE_CLASS_RE.fullmatch(upper):
        return True
    if re.fullmatch(r"[A-Z]{2}\s*[-–]\s*[A-Z ]+", upper):
        return True
    if upper.startswith("MINISTRY OF HEALTH") or upper.startswith("GUIDING PRINCIPLES") or upper.startswith("GUIDANCE ON SPECIFIC"):
        return True
    return False


def normalize_desc_text(text: str) -> str:
    text = text.upper()
    text = text.replace("  ", " ")
    text = text.replace(" + ", " ")
    text = WHITESPACE_RE.sub(" ", text).strip(" ,")
    return text


def extract_tosp_procedures(pdf_path: Path) -> list[RawProcedure]:
    total_pages = page_count(pdf_path)
    records: dict[str, RawProcedure] = {}

    def walk_lines(item, sink: list[dict]) -> None:
        if isinstance(item, LTTextLine):
            txt = clean_line(item.get_text())
            if txt:
                x0, y0, x1, y1 = item.bbox
                sink.append({"text": txt, "x0": x0, "x1": x1, "y0": y0, "y1": y1, "yc": (y0 + y1) / 2})
        if hasattr(item, "__iter__"):
            for child in item:
                walk_lines(child, sink)

    for page_idx, layout in enumerate(extract_pages(str(pdf_path))):
        page_num = page_idx + 1
        if page_num > total_pages:
            break
        domain_info = page_domain(page_num)
        if domain_info is None:
            continue
        domain, _expected_prefix = domain_info

        line_items: list[dict] = []
        walk_lines(layout, line_items)
        line_items = [li for li in line_items if li["y1"] > 70 and not should_skip_line(li["text"])]

        code_rows: list[dict] = []
        for li in line_items:
            if li["x0"] > 150:
                continue
            m = SERIAL_AND_CODE_RE.match(li["text"])
            if not m:
                continue
            code = m.group(1)
            code_rows.append(
                {
                    "code": code,
                    "y": li["yc"],
                    "line": li["text"],
                    "inline_desc": (m.group(2) or "").strip(),
                }
            )

        code_rows.sort(key=lambda r: -r["y"])
        if not code_rows:
            continue

        desc_candidates = [
            li
            for li in line_items
            if 120 <= li["x0"] <= 430 and not CODE_RE.search(li["text"])
        ]

        desc_by_code: dict[str, list[dict]] = {row["code"]: [] for row in code_rows}
        for li in desc_candidates:
            txt = li["text"]
            if txt in {"Descriptor", "Change", "Existing"}:
                continue
            if TABLE_CLASS_RE.fullmatch(txt.upper()):
                continue
            nearest = min(code_rows, key=lambda row: abs(li["yc"] - row["y"]))
            # Guard against stray page footer/header text.
            if abs(li["yc"] - nearest["y"]) > 40:
                continue
            desc_by_code[nearest["code"]].append(li)

        for idx, row in enumerate(code_rows):
            parts: list[str] = []
            if row["inline_desc"]:
                parts.append(row["inline_desc"])

            band_lines = sorted(desc_by_code.get(row["code"], []), key=lambda li: -li["yc"])
            for li in band_lines:
                parts.append(li["text"])

            raw_name = normalize_desc_text(" ".join(parts))
            raw_name = re.sub(r"\s+,", ",", raw_name).strip()
            if not raw_name:
                raw_name = "[MISSING DESCRIPTION - REVIEW SOURCE PDF]"

            pdf_procedure_id = f"tosp_{row['code'].lower()}"
            snippet = f"{row['code']} {raw_name}"[:220]
            existing = records.get(row["code"])
            if existing is None or (existing.raw_name.startswith("[MISSING") and not raw_name.startswith("[MISSING")):
                records[row["code"]] = RawProcedure(
                    pdf_procedure_id=pdf_procedure_id,
                    code=row["code"],
                    raw_name=raw_name,
                    source_page=page_num,
                    source_text_snippet=snippet,
                    domain=domain,
                )

    out = []
    for code in sorted(records.keys()):
        rec = records[code]
        if CODE_RE.fullmatch(code):
            out.append(rec)
    return out


def slugify(text: str, max_len: int = 80) -> str:
    slug = NON_ALNUM_RE.sub("_", text.lower()).strip("_")
    slug = re.sub(r"_+", "_", slug)
    if len(slug) > max_len:
        slug = slug[:max_len].rstrip("_")
    return slug or "unknown"


def titleish(text: str) -> str:
    # Keep acronyms and punctuation sensible without over-formatting.
    words = []
    for token in text.split():
        if len(token) <= 4 and token.isupper():
            words.append(token)
        elif token in {"ORIF", "CABG", "EVAR", "TAVI", "TAVR", "EBUS", "ERCP", "PACU", "AV"}:
            words.append(token)
        else:
            words.append(token.capitalize())
    return " ".join(words)


def is_protected_open_closed(desc_upper: str) -> bool:
    return any(k in desc_upper for k in ["OPEN HEART", "CLOSED HEART", "INTRACRANIAL", "BRAIN", "CRANIOT", "CESAREAN", "CAESAREAN", "LABOR"])


def canonicalize_to_primary(raw_name: str, domain: str) -> tuple[str, list[str], str, str]:
    desc = raw_name.upper()
    modifiers: list[str] = []
    confidence = "high"

    for patt, mod in LATERALITY_PATTERNS:
        if patt.search(desc):
            modifiers.append(mod)
            desc = patt.sub(" ", desc)

    for patt, mod in WITH_MODIFIER_PATTERNS:
        if patt.search(desc):
            modifiers.append(mod)
            desc = patt.sub(" ", desc)
            confidence = "med"

    for token, mod in APPROACH_MODIFIERS.items():
        if token in desc:
            if mod == "open" and is_protected_open_closed(desc):
                continue
            modifiers.append(mod)
            desc = re.sub(rf"\b{re.escape(token)}\b", " ", desc)
            confidence = "med"

    # Remove generic “WITH/WITHOUT ...” clauses that commonly represent surgical variants
    # while retaining the raw mapping for traceability/review.
    if "WITH" in desc:
        protected = ["WITH CARDIOPULMONARY BYPASS", "WITHOUT CARDIOPULMONARY BYPASS"]
        protected_hit = any(p in desc for p in protected)
        if not protected_hit:
            desc = re.sub(r"\bWITH/?WITHOUT\b[^,;]*", " ", desc)
            desc = re.sub(r"\bWITH\b[^,;]*", " ", desc)
            confidence = "low"

    # Normalize punctuation and filler terms while preserving the principal procedure phrase.
    desc = desc.replace(" + ", " ")
    desc = re.sub(r"\([^)]*\)", " ", desc)
    desc = re.sub(r"\bSINGLE LESION\b", " ", desc)
    desc = re.sub(r"\bMULTIPLE LESIONS\b", " ", desc)
    desc = re.sub(r"\bVARIOUS LESIONS\b", " ", desc)
    desc = re.sub(r"\bFOR MALIGNANCY\b", " ", desc)
    desc = re.sub(r"\bTRAUMA\b", " TRAUMA ", desc)
    desc = re.sub(r"\s+", " ", desc).strip(" ,/")

    # Domain-specific anchor heuristics to avoid over-collapsing.
    if domain == "female_genital" and any(x in raw_name.upper() for x in ["LABOR", "CAESAREAN", "CESAREAN", "C/S"]):
        if any(x in raw_name.upper() for x in ["CAESAREAN", "CESAREAN", "C/S"]):
            desc = "OBSTETRIC CESAREAN DELIVERY"
        elif "LABOR" in raw_name.upper():
            desc = "OBSTETRIC LABOR ANALGESIA"
        confidence = "high"

    # Improve readability for some noisy entries.
    desc = re.sub(r"\s+", " ", desc).strip()
    if not desc:
        desc = raw_name.upper()
        confidence = "low"

    display_name = titleish(desc)
    primary_id = f"pap_{slugify(desc)}"
    return primary_id, sorted(set(modifiers)), display_name, confidence


def build_taxonomy(records: list[RawProcedure]):
    primary_by_id: dict[str, PrimaryProcedure] = {}
    mapping_rows = []
    for rec in records:
        primary_id, default_mods, display_name, confidence = canonicalize_to_primary(rec.raw_name, rec.domain)
        p = primary_by_id.get(primary_id)
        if p is None:
            p = PrimaryProcedure(primary_procedure_id=primary_id, display_name=display_name, domain=rec.domain)
            primary_by_id[primary_id] = p
        p.allowed_modifiers.update(default_mods)
        if p.domain != rec.domain:
            # Cross-domain collision means normalization is likely too aggressive.
            confidence = "low"
        needs_review = confidence == "low" or rec.raw_name.startswith("[MISSING")
        mapping_rows.append(
            {
                "pdf_procedure_id": rec.pdf_procedure_id,
                "primary_procedure_id": primary_id,
                "default_modifiers": json.dumps(default_mods),
                "mapping_confidence": confidence,
                "needs_review": str(needs_review).lower(),
            }
        )

    primary_rows = [
        {
            "primary_procedure_id": p.primary_procedure_id,
            "display_name": p.display_name,
            "domain": p.domain,
            "allowed_modifiers": json.dumps(sorted(p.allowed_modifiers)),
        }
        for p in sorted(primary_by_id.values(), key=lambda x: x.primary_procedure_id)
    ]
    return primary_rows, mapping_rows


def map_primary_to_coa(primary_rows: list[dict]) -> list[dict]:
    rows = []
    for p in primary_rows:
        pid = p["primary_procedure_id"]
        name = p["display_name"].upper()
        domain = p["domain"]
        keys: set[str] = set()

        # OB-specific (must remain distinct)
        if any(x in name for x in ["CESAREAN", "CAESAREAN"]):
            keys.update({"coa.case.ob.obstetrical_management", "coa.case.ob.cesarean_delivery", "coa.case.anatomic.intra_abdominal"})
        elif "OBSTETRIC LABOR ANALGESIA" in name or "LABOR" in name:
            keys.update({"coa.case.ob.obstetrical_management", "coa.case.ob.analgesia_for_labor"})

        # Pain management related primary procedures
        if "PAIN" in name or any(x in name for x in ["EPIDURAL", "NERVE BLOCK", "FACET", "TRIGGER POINT"]):
            keys.add("coa.case.pain_management_encounter")

        # Anatomic categories by domain + keywords
        if domain in {"digestive", "urinary", "female_genital", "male_genital", "endocrine"}:
            if not any(x in name for x in ["ERCP", "COLONOSCOPY", "ENDOSCOPY"]):
                if any(x in name for x in ["ABDOMEN", "LAPAROTOMY", "LAPAROSCOPY", "CHOLE", "APPEND", "BOWEL", "COLO", "GASTR", "HEPAT", "SPLEEN", "PANCREA", "CYSTECT", "PROSTATECT", "UTER", "OVAR", "HYSTER", "NEPHR", "KIDNEY"]):
                    keys.add("coa.case.anatomic.intra_abdominal")

        if any(x in name for x in ["BRONCHOSCOPY", "ESOPHAGOSCOPY", "ERCP", "TONSIL", "ADENOID", "PALATE", "PHARYNX", "LARYNX", "DENT", "ODONTE"]):
            keys.add("coa.case.anatomic.oropharyngeal")

        if domain == "nervous" and any(x in name for x in ["INTRACRANIAL", "BRAIN", "ANEURYSM", "AV MALFORMATION", "CRANIOT", "CAVERNOUS"]):
            keys.add("coa.case.anatomic.intracranial_total")
            if any(x in name for x in ["EMBOL", "COILING", "THROMBECTOMY", "TRANSCATHETER", "PERCUTANEOUS"]):
                keys.add("coa.case.anatomic.intracranial_closed")
            else:
                keys.add("coa.case.anatomic.intracranial_open")

        # Because the catalog uses intracranial total + open (and closed implied), only output keys that exist.
        keys = {k for k in keys if any(k == req[0] for req in COA_REQUIREMENTS)}

        if domain == "cardiovascular":
            # Vascular category broadly applies to many vascular procedures.
            if any(x in name for x in ["AORTA", "ARTERY", "VEIN", "FISTULA", "BYPASS", "ENDARTERECT", "STENT", "THROMBECT", "ANEURYSM"]):
                keys.add("coa.case.anatomic.vascular")
            # Heart intrathoracic split
            if any(x in name for x in ["CABG", "OPEN HEART", "VALVE", "MAZE", "CARDIOPULMONARY BYPASS", "STERNOTOMY"]):
                keys.update({"coa.case.anatomic.intrathoracic_total", "coa.case.anatomic.intrathoracic_open_heart"})
            elif any(x in name for x in ["ABLATION", "TAVR", "TAVI", "TRANSCATHETER", "PACEMAKER", "ICD", "LARIAT", "PERIVALVULAR"]):
                keys.update({"coa.case.anatomic.intrathoracic_total", "coa.case.anatomic.intrathoracic_closed_heart"})
            elif any(x in name for x in ["THORACIC AORTA", "VENA CAVA"]):
                keys.update({"coa.case.anatomic.intrathoracic_total"})

        if domain == "respiratory":
            if any(x in name for x in ["LUNG", "THORAC", "VATS", "PLEURA"]):
                keys.update({"coa.case.anatomic.intrathoracic_total", "coa.case.anatomic.intrathoracic_lung"})
            if any(x in name for x in ["BRONCHOSCOPY", "LARYNG", "TRACHEO"]):
                keys.add("coa.case.anatomic.oropharyngeal")

        if domain == "nervous" and any(x in name for x in ["SPINE", "VERTEBR", "LAMINECT", "DISCECT", "FUSION"]):
            keys.add("coa.case.anatomic.neuroskeletal")

        if any(x in name for x in ["THYROID", "PARATHYROID", "TRACHEOSTOMY", "NECK"]):
            keys.add("coa.case.anatomic.neck")

        rows.append(
            {
                "primary_procedure_id": pid,
                "coa_requirement_keys": json.dumps(sorted(keys)),
            }
        )
    return rows


def build_master_rows(records: list[RawProcedure]) -> list[dict]:
    return [
        {
            "pdf_procedure_id": r.pdf_procedure_id,
            "raw_name": r.raw_name,
            "source_page": r.source_page,
            "source_text_snippet": r.source_text_snippet,
        }
        for r in sorted(records, key=lambda x: x.code)
    ]


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_coa_catalog(data_dir: Path) -> None:
    rows = [
        {
            "requirement_key": key,
            "label": label,
            "min_required": min_required,
            "count_type": count_type,
            "simulation_allowed": str(sim_allowed).lower(),
        }
        for key, label, min_required, count_type, sim_allowed in COA_REQUIREMENTS
    ]
    write_csv(
        data_dir / "coa_requirements_catalog.csv",
        rows,
        ["requirement_key", "label", "min_required", "count_type", "simulation_allowed"],
    )


def write_skill_mapping(data_dir: Path) -> None:
    rows = [
        {
            "skill_code": skill_code,
            "coa_requirement_key": req_key,
            "validation_rule": validation_rule,
            "exclusions": exclusions,
        }
        for skill_code, req_key, validation_rule, exclusions in SKILL_TO_COA
    ]
    write_csv(
        data_dir / "skill_to_coa_requirement_mapping.csv",
        rows,
        ["skill_code", "coa_requirement_key", "validation_rule", "exclusions"],
    )


def compute_manifest_hash(rows: Iterable[dict]) -> str:
    h = hashlib.sha256()
    for row in rows:
        h.update(json.dumps(row, sort_keys=True).encode("utf-8"))
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build TOSP procedure library + anesthesia taxonomy scaffolds + COA mapping CSVs")
    parser.add_argument("--surgical-pdf", type=Path, default=Path("/Users/zacharystewart/Desktop/table-of-surgical-procedures-(as-of-1-jan-2024).pdf"))
    parser.add_argument("--coa-pdf", type=Path, default=Path("/Users/zacharystewart/Desktop/Guidelines-for-Counting-Clinical-Experiences-Jan-2026.pdf"))
    parser.add_argument("--out-dir", type=Path, default=Path("data"))
    args = parser.parse_args()

    if not args.surgical_pdf.exists():
        raise SystemExit(f"Missing surgical PDF: {args.surgical_pdf}")
    if not args.coa_pdf.exists():
        raise SystemExit(f"Missing COA PDF: {args.coa_pdf}")

    records = extract_tosp_procedures(args.surgical_pdf)
    if not records:
        raise SystemExit("No TOSP procedure rows extracted")

    master_rows = build_master_rows(records)
    primary_rows, mapping_rows = build_taxonomy(records)
    primary_to_coa_rows = map_primary_to_coa(primary_rows)

    out = args.out_dir
    write_csv(out / "surgical_procedure_master.csv", master_rows, ["pdf_procedure_id", "raw_name", "source_page", "source_text_snippet"])
    write_csv(out / "anesthesia_primary_procedure.csv", primary_rows, ["primary_procedure_id", "display_name", "domain", "allowed_modifiers"])
    write_csv(out / "procedure_master_mapping.csv", mapping_rows, ["pdf_procedure_id", "primary_procedure_id", "default_modifiers", "mapping_confidence", "needs_review"])
    write_coa_catalog(out)
    write_csv(out / "primary_procedure_to_coa_mapping.csv", primary_to_coa_rows, ["primary_procedure_id", "coa_requirement_keys"])
    write_skill_mapping(out)

    manifest = {
        "surgical_pdf": str(args.surgical_pdf),
        "coa_pdf": str(args.coa_pdf),
        "surgical_rows": len(master_rows),
        "primary_rows": len(primary_rows),
        "mapping_rows": len(mapping_rows),
        "primary_to_coa_rows": len(primary_to_coa_rows),
        "master_hash": compute_manifest_hash(master_rows),
    }
    (out / "build_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
