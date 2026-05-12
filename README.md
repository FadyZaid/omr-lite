# OMR-Lite

OMR-Lite is an application that automates the grading of bubble-sheet (multiple-choice) answer papers using **Optical Mark Recognition (OMR)**. Instructors upload scanned images of completed answer sheets; OMR-Lite detects which bubbles were filled, compares them against the answer key, scores each sheet, and produces colour-coded grading visualisations - all within seconds. No need to worry about alignment, rotation, post-correction analysis, grades, ... all within one button press.

## Key Features

| Feature | Description |
|---|---|
| **Batch Scanning** | Upload and process any number of answer-sheet images or PDFs in a single batch. |
| **Visual Feedback** | Colour-coded overlays show correct, wrong, uncertain, and excluded answers on every scanned sheet. |
| **Student ID Recognition** | Reads numeric student IDs from bubble-based ID grids — no additional hardware required. |
| **Configurable ROI** | Define question regions interactively on a template image; reuse the same layout across unlimited batches. |
| **Adjustable Threshold** | Fine-tune the fill-detection threshold in real time to accommodate faint or heavy pencil marks. |
| **Uncertainty Flagging** | Ambiguous or multi-marked answers are automatically flagged and isolated for manual review. |
| **Scan History** | All batches are persisted locally; re-open any batch to view, edit, or export results. |
| **Export** | Download per-batch results as Excel (.xlsx), or CSV. |
| **Question Analytics** | Per-question performance breakdown across all papers in a batch. |
| **Offline-First** | All data stays on the instructors's machine. |

---

## Technology Stack

| Layer | Technology |
|---|---|
| API backend | Python · [Flask 3](https://flask.palletsprojects.com/) |
| Frontend | HTML5 · CSS3 · Vanilla JavaScript (Jinja2-rendered) |
| Image processing | [OpenCV 4](https://opencv.org/) · NumPy · Pillow |
| PDF handling | PyMuPDF (fitz) · PyPDF2 |
| Database | [SQLite 3](https://www.sqlite.org/index.html) via Python `sqlite3` |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/FadyZaid/omr-lite.git
cd omr-lite

# 2. Create and activate a virtual environment
python -m venv .venv
# Windows
backend\.venv\Scripts\Activate.ps1
# macOS / Linux
source backend/.venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the application
python app.py

# 5. Open the browser on localhost:{port}
```

