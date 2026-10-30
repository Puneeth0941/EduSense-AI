import io
import os
from typing import Any, Dict, List, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side


def sanitize_cell_value(val: Any) -> Any:
    """
    Prevents spreadsheet formula injection.
    Prefixes any string starting with =, +, -, @, \\t, or \\r with a single quote.
    """
    if val is None:
        return ""
    if isinstance(val, str):
        if len(val) > 0 and val[0] in ("=", "+", "-", "@", "\t", "\r"):
            return f"'{val}"
    return val


def format_duration(seconds: Any) -> str:
    """Formats duration in seconds to a human-readable string (e.g. '45 minutes', '0 minutes')."""
    if seconds is None:
        return "0 minutes"
    try:
        if isinstance(seconds, str):
            if "minute" in seconds.lower():
                return seconds
            secs = float(seconds)
        else:
            secs = float(seconds)
        mins = int(round(secs / 60.0))
        return f"{mins} minutes"
    except Exception:
        return "0 minutes"


def format_percentage(pct: Any) -> str:
    """Formats attendance percentage to a string (e.g. '75.0%', '0%')."""
    if pct is None:
        return "0%"
    try:
        if isinstance(pct, str):
            if "%" in pct:
                return pct
            val = float(pct)
        else:
            val = float(pct)
        if val.is_integer():
            return f"{int(val)}%"
        return f"{val:.1f}%"
    except Exception:
        return "0%"


def generate_attendance_excel_workbook(
    class_subject: Optional[str] = None,
    session_date: Optional[str] = None,
    lecture_name: Optional[str] = None,
    present_students: Optional[List[Dict[str, Any]]] = None,
    partial_students: Optional[List[Dict[str, Any]]] = None,
    absent_students: Optional[List[Dict[str, Any]]] = None,
) -> io.BytesIO:
    """
    Generates an exact-match Excel attendance report (.xlsx) using openpyxl,
    strictly replicating the approved layout of:
    EduSense_Attendance_Report_Present_and_Absent_Sample.xlsx.

    Layout Specifications:
    - Single worksheet named: 'Present Students'
    - Column widths:
      A: 10.0 (Sl. No.)
      B: 24.0 (Name)
      C: 20.0 (USN)
      D: 23.0 (Facial Emotion)
      E: 25.0 (Speech Sentiment)
      F: 20.0 (Present Duration)
      G: 16.0 (Attendance %)
    - Header rows 1-3:
      Row 1: 'Class / Subject: <value>' (merged A1:G1, height 24.0)
      Row 2: 'Date: <value>' (merged A2:G2, height 24.0)
      Row 3: 'Name of Lecture: <value>' (merged A3:G3, height 24.0)
    - Section 1: 'List of the Present Students'
    - Section 2: 'List of the Partial Attendance Students'
    - Section 3: 'List of the Absent Students'
    - Table headers: Height 38.0, Navy Blue fill #1F4E78, bold 11pt White font
    - Data rows: Height 25.0, thin slate borders #667085, Calibri 11pt
    - A4 portrait print setup with fit-to-page enabled.
    """
    template_path = os.path.join(
        os.path.dirname(__file__), "..", "templates", "EduSense_Attendance_Report_Present_and_Absent_Sample.xlsx"
    )

    if os.path.exists(template_path):
        wb = openpyxl.load_workbook(template_path)
        ws = wb.active
        # Unmerge all existing merged ranges first
        merged_ranges = list(ws.merged_cells.ranges)
        for rng in merged_ranges:
            try:
                ws.unmerge_cells(str(rng))
            except Exception:
                pass

        # Clear existing sheet cells
        for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
            for cell in row:
                try:
                    cell.value = None
                except Exception:
                    pass
    else:
        wb = openpyxl.Workbook()
        ws = wb.active

    ws.title = "Present Students"

    present_list = present_students or []
    partial_list = partial_students or []
    absent_list = absent_students or []

    # Palette & Typography
    border_color = "00667085"  # Slate Gray matching approved template
    header_fill_color = "001F4E78"  # Dark Navy Blue matching approved template

    thin_border = Border(
        left=Side(style="thin", color=border_color),
        right=Side(style="thin", color=border_color),
        top=Side(style="thin", color=border_color),
        bottom=Side(style="thin", color=border_color),
    )

    header_font = Font(name="Calibri", size=11, bold=True, color="00FFFFFF")
    header_fill = PatternFill(start_color=header_fill_color, end_color=header_fill_color, fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    data_font = Font(name="Calibri", size=11, bold=False, color="00000000")
    center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    meta_font = Font(name="Calibri", size=11, bold=False)
    meta_alignment = Alignment(vertical="center")

    title_font = Font(name="Calibri", size=14, bold=True)
    title_alignment = Alignment(horizontal="center", vertical="center")

    # Column Widths
    col_widths = {
        "A": 10.0,
        "B": 24.0,
        "C": 20.0,
        "D": 23.0,
        "E": 25.0,
        "F": 20.0,
        "G": 16.0,
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    # Page Setup
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0

    # 1. Metadata Header Block (Rows 1-3)
    ws.merge_cells("A1:G1")
    ws.row_dimensions[1].height = 24.0
    c1 = ws["A1"]
    c1.value = f"Class / Subject: {class_subject.strip()}" if class_subject and class_subject.strip() else "Class / Subject: ______________________________________________"
    c1.font = meta_font
    c1.alignment = meta_alignment

    ws.merge_cells("A2:G2")
    ws.row_dimensions[2].height = 24.0
    c2 = ws["A2"]
    c2.value = f"Date: {session_date.strip()}" if session_date and session_date.strip() else "Date: _________________________________________________________"
    c2.font = meta_font
    c2.alignment = meta_alignment

    ws.merge_cells("A3:G3")
    ws.row_dimensions[3].height = 24.0
    c3 = ws["A3"]
    c3.value = f"Name of Lecture: {lecture_name.strip()}" if lecture_name and lecture_name.strip() else "Name of Lecture: ______________________________________________"
    c3.font = meta_font
    c3.alignment = meta_alignment

    headers = [
        "Sl. No.",
        "Name",
        "USN",
        "Facial Emotion",
        "Speech Sentiment",
        "Present Duration",
        "Attendance %",
    ]

    current_row = 4

    def render_section(title: str, students: List[Dict[str, Any]], is_absent_section: bool = False):
        nonlocal current_row

        # Title Row
        ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=7)
        ws.row_dimensions[current_row].height = 30.0
        title_cell = ws.cell(row=current_row, column=1, value=title)
        title_cell.font = title_font
        title_cell.alignment = title_alignment
        current_row += 1

        # Blank spacing row
        ws.row_dimensions[current_row].height = 15.0
        current_row += 1

        # Table Header Row
        ws.row_dimensions[current_row].height = 38.0
        for col_idx, h_text in enumerate(headers, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=h_text)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
        current_row += 1

        # Data Rows
        if students:
            for idx, student in enumerate(students, start=1):
                ws.row_dimensions[current_row].height = 25.0

                name_val = sanitize_cell_value(student.get("name") or student.get("full_name") or "")
                usn_val = sanitize_cell_value(student.get("usn") or student.get("student_id_number") or "")

                if is_absent_section:
                    emotion_val = "N/A"
                    sentiment_val = "N/A"
                    duration_val = "0 minutes"
                    pct_val = "0%"
                else:
                    raw_emotion = student.get("facial_emotion")
                    emotion_val = sanitize_cell_value(raw_emotion) if raw_emotion else "N/A"

                    raw_sentiment = student.get("speech_sentiment")
                    sentiment_val = sanitize_cell_value(raw_sentiment) if raw_sentiment else "N/A"

                    duration_val = format_duration(student.get("present_duration", student.get("presence_duration_seconds", 0)))
                    pct_val = format_percentage(student.get("attendance_percentage", 0.0))

                row_values = [
                    idx,
                    name_val,
                    usn_val,
                    emotion_val,
                    sentiment_val,
                    duration_val,
                    pct_val,
                ]

                for col_idx, val in enumerate(row_values, start=1):
                    cell = ws.cell(row=current_row, column=col_idx, value=val)
                    cell.font = data_font
                    cell.border = thin_border
                    if col_idx == 2:  # Name column is left-aligned
                        cell.alignment = left_alignment
                    else:
                        cell.alignment = center_alignment

                current_row += 1
        else:
            # If no students in this category, render one empty formatted row indicating None
            ws.row_dimensions[current_row].height = 25.0
            row_values = ["-", "None", "-", "N/A", "N/A", "0 minutes" if is_absent_section else "-", "0%" if is_absent_section else "-"]
            for col_idx, val in enumerate(row_values, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = center_alignment
            current_row += 1

        # Blank row after section
        ws.row_dimensions[current_row].height = 18.0
        current_row += 1

    # Render Section 1: Present Students (>= 75%)
    render_section("List of the Present Students", present_list, is_absent_section=False)

    # Render Section 2: Partial Attendance Students (> 0% and < 75%)
    render_section("List of the Partial Attendance Students", partial_list, is_absent_section=False)

    # Render Section 3: Absent Students (0%)
    render_section("List of the Absent Students", absent_list, is_absent_section=True)

    # Freeze panes below metadata (at row 4)
    ws.freeze_panes = "A4"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream
