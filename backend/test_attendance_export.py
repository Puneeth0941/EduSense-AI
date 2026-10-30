import os
import sys
import uuid
import io
from datetime import datetime, timezone, timedelta
import openpyxl
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import (
    FaceEmbedding,
    AttendanceRecord,
    FacialAnalysis,
    SentimentAnalysis,
)
from app.core.security import create_access_token
from app.services.attendance_export_service import sanitize_cell_value


def test_attendance_export_suite():
    print("==================================================")
    print("RUNNING COMPREHENSIVE ATTENDANCE EXPORT TESTS")
    print("==================================================")

    client = TestClient(app)
    db = SessionLocal()

    created_user_ids = []
    created_classroom_ids = []
    created_session_ids = []

    try:
        # 1. Setup Teacher Alice (Owner)
        teacher_a = User(
            email=f"teacher_a_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Teacher Alice",
            role=UserRole.TEACHER,
        )
        db.add(teacher_a)
        db.commit()
        created_user_ids.append(teacher_a.id)

        t_profile_a = TeacherProfile(user_id=teacher_a.id, employee_id=f"EMP_A_{uuid.uuid4().hex[:4]}")
        db.add(t_profile_a)
        db.commit()

        # 2. Setup Teacher Bob (Unauthorized Third-Party)
        teacher_b = User(
            email=f"teacher_b_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Teacher Bob",
            role=UserRole.TEACHER,
        )
        db.add(teacher_b)
        db.commit()
        created_user_ids.append(teacher_b.id)

        t_profile_b = TeacherProfile(user_id=teacher_b.id, employee_id=f"EMP_B_{uuid.uuid4().hex[:4]}")
        db.add(t_profile_b)
        db.commit()

        # 3. Setup Students
        # Student 1: Verified Present (with stored emotion + sentiment + potential formula injection name)
        student_1 = User(
            email=f"student_1_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="=HYPERLINK(\"http://evil.com\",\"Puneeth Gowda\")",
            role=UserRole.STUDENT,
        )
        db.add(student_1)
        db.commit()
        created_user_ids.append(student_1.id)
        s_profile_1 = StudentProfile(user_id=student_1.id, student_id_number="4CB23AI073")
        db.add(s_profile_1)
        db.commit()

        # Student 2: Verified Present (no emotion or sentiment recorded -> should show 'N/A')
        student_2 = User(
            email=f"student_2_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Sindhana K",
            role=UserRole.STUDENT,
        )
        db.add(student_2)
        db.commit()
        created_user_ids.append(student_2.id)
        s_profile_2 = StudentProfile(user_id=student_2.id, student_id_number="4CB23AI108")
        db.add(s_profile_2)
        db.commit()

        # Student 3: Absent (registered in session, marked ABSENT) -> MUST BE EXCLUDED
        student_3 = User(
            email=f"student_3_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Absent Student",
            role=UserRole.STUDENT,
        )
        db.add(student_3)
        db.commit()
        created_user_ids.append(student_3.id)
        s_profile_3 = StudentProfile(user_id=student_3.id, student_id_number="4CB23AI999")
        db.add(s_profile_3)
        db.commit()

        # Student 4: Unverified (registered in session, only 1 face sample -> UNVERIFIED) -> MUST BE EXCLUDED
        student_4 = User(
            email=f"student_4_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Unverified Student",
            role=UserRole.STUDENT,
        )
        db.add(student_4)
        db.commit()
        created_user_ids.append(student_4.id)
        s_profile_4 = StudentProfile(user_id=student_4.id, student_id_number="4CB23AI000")
        db.add(s_profile_4)
        db.commit()

        # 4. Setup Classroom A owned by Teacher Alice
        classroom_a = Classroom(
            title="Computer Vision 101",
            course_code="CS101",
            teacher_id=t_profile_a.id,
            livekit_room_name=f"room_{uuid.uuid4().hex[:6]}",
        )
        db.add(classroom_a)
        db.commit()
        created_classroom_ids.append(classroom_a.id)

        # 5. Setup Completed Class Session A
        now_utc = datetime.now(timezone.utc)
        session_a = ClassSession(
            classroom_id=classroom_a.id,
            title="ArcFace Facial Verification Lab",
            status=SessionStatus.COMPLETED,
            scheduled_start_time=now_utc - timedelta(hours=2),
            scheduled_end_time=now_utc - timedelta(hours=1),
            actual_start_time=now_utc - timedelta(hours=2),
            actual_end_time=now_utc - timedelta(hours=1),
        )
        db.add(session_a)
        db.commit()
        created_session_ids.append(session_a.id)

        # Add session participants
        p1 = SessionParticipant(session_id=session_a.id, user_id=student_1.id, role=UserRole.STUDENT)
        p2 = SessionParticipant(session_id=session_a.id, user_id=student_2.id, role=UserRole.STUDENT)
        p3 = SessionParticipant(session_id=session_a.id, user_id=student_3.id, role=UserRole.STUDENT)
        p4 = SessionParticipant(session_id=session_a.id, user_id=student_4.id, role=UserRole.STUDENT)
        db.add_all([p1, p2, p3, p4])
        db.commit()

        # Add Attendance Records
        # Student 1: PRESENT (verified on time)
        rec_1 = AttendanceRecord(
            session_id=session_a.id,
            student_id=s_profile_1.id,
            status=AttendanceStatus.PRESENT,
            marked_at=now_utc - timedelta(hours=2),
            first_verified_at=now_utc - timedelta(hours=2),
            last_verified_at=now_utc - timedelta(hours=1, minutes=10),
            verification_count=3,
            presence_duration_seconds=3000,
            is_manually_corrected=False,
        )
        # Student 2: PRESENT (verified on time)
        rec_2 = AttendanceRecord(
            session_id=session_a.id,
            student_id=s_profile_2.id,
            status=AttendanceStatus.PRESENT,
            marked_at=now_utc - timedelta(hours=2),
            first_verified_at=now_utc - timedelta(hours=2),
            last_verified_at=now_utc - timedelta(hours=1, minutes=10),
            verification_count=3,
            presence_duration_seconds=3000,
            is_manually_corrected=False,
        )
        # Student 3: ABSENT
        rec_3 = AttendanceRecord(
            session_id=session_a.id,
            student_id=s_profile_3.id,
            status=AttendanceStatus.ABSENT,
            marked_at=now_utc - timedelta(hours=2),
            verification_count=0,
            presence_duration_seconds=0,
            is_manually_corrected=False,
        )
        # Student 4: UNVERIFIED (only 1 frame, not yet confirmed)
        rec_4 = AttendanceRecord(
            session_id=session_a.id,
            student_id=s_profile_4.id,
            status=AttendanceStatus.UNVERIFIED,
            marked_at=now_utc - timedelta(hours=2),
            first_verified_at=now_utc - timedelta(hours=2),
            last_verified_at=now_utc - timedelta(hours=2),
            verification_count=1,
            presence_duration_seconds=60,
            is_manually_corrected=False,
        )
        db.add_all([rec_1, rec_2, rec_3, rec_4])
        db.commit()

        # Add Analytics Data:
        # Student 1 has facial emotion 'happy' and speech sentiment 'positive'
        fa_1 = FacialAnalysis(
            session_id=session_a.id,
            student_id=s_profile_1.id,
            dominant_emotion="happy",
            sampled_at=now_utc - timedelta(hours=1, minutes=45),
        )
        sent_1 = SentimentAnalysis(
            session_id=session_a.id,
            user_id=student_1.id,
            sentiment_label="positive",
            sentiment_score=0.85,
            created_at=now_utc - timedelta(hours=1, minutes=40),
        )
        db.add_all([fa_1, sent_1])
        db.commit()

        # Student 2 has NO emotion or sentiment records in DB.

        # Generate JWT Auth Tokens
        teacher_a_token = create_access_token(data={"sub": str(teacher_a.id), "role": teacher_a.role.value})
        teacher_b_token = create_access_token(data={"sub": str(teacher_b.id), "role": teacher_b.role.value})
        student_token = create_access_token(data={"sub": str(student_1.id), "role": student_1.role.value})

        headers_a = {"Authorization": f"Bearer {teacher_a_token}"}
        headers_b = {"Authorization": f"Bearer {teacher_b_token}"}
        headers_student = {"Authorization": f"Bearer {student_token}"}

        # -------------------------------------------------------------
        # TEST 1: Exact Report Layout & Verified Data Matching
        # -------------------------------------------------------------
        print("\n--- TEST 1: Valid Session Export Layout & Data Verification ---")
        res_export = client.get(
            f"/api/attendance/export?session_id={session_a.id}",
            headers=headers_a,
        )
        assert res_export.status_code == 200, f"Expected 200, got {res_export.status_code}: {res_export.text}"
        assert res_export.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disposition = res_export.headers.get("content-disposition", "")
        assert "attachment; filename=\"EduSense_Present_Students_" in disposition, f"Filename header mismatch: {disposition}"
        assert disposition.endswith('.xlsx"')

        # Load workbook in-memory
        wb = openpyxl.load_workbook(io.BytesIO(res_export.content))
        assert wb.sheetnames == ["Present Students"], f"Expected single sheet ['Present Students'], got {wb.sheetnames}"

        ws = wb["Present Students"]

        # 1a. Validate Top Metadata Block
        assert ws["A1"].value.startswith("Class / Subject:"), f"Row 1 mismatch: {ws['A1'].value}"
        assert "Computer Vision 101 (CS101)" in ws["A1"].value
        assert ws["A2"].value.startswith("Date:"), f"Row 2 mismatch: {ws['A2'].value}"
        assert ws["A3"].value == "Name of Lecture: ArcFace Facial Verification Lab", f"Row 3 mismatch: {ws['A3'].value}"
        assert ws["A4"].value == "List of the Present Students", f"Row 4 title mismatch: {ws['A4'].value}"
        assert ws["A5"].value is None, "Row 5 should be empty separator"

        # 1b. Validate Row 6 Column Headings
        expected_headers = ["Sl. No.", "Name", "USN", "Facial Emotion", "Speech Sentiment"]
        actual_headers = [ws.cell(row=6, column=c).value for c in range(1, 6)]
        assert actual_headers == expected_headers, f"Row 6 header mismatch: {actual_headers} vs {expected_headers}"

        # Validate Row 6 styling
        header_fill = ws.cell(row=6, column=1).fill.fgColor.value
        assert header_fill in ("001F4E78", "1F4E78"), f"Header fill mismatch: {header_fill}"
        assert ws.cell(row=6, column=1).font.bold is True

        # 1c. Validate Verified Present Students (Only Student 1 and Student 2)
        # Row 7 and Row 8 should contain present students
        rows_data = []
        for r in range(7, ws.max_row + 1):
            row_vals = [ws.cell(row=r, column=c).value for c in range(1, 6)]
            if any(row_vals):
                rows_data.append(row_vals)

        assert len(rows_data) == 2, f"Expected exactly 2 verified students, got {len(rows_data)}: {rows_data}"

        # Sl. No. checks
        assert rows_data[0][0] == 1, "Sl. No. for first row should be 1"
        assert rows_data[1][0] == 2, "Sl. No. for second row should be 2"

        # USNs present in output
        output_usns = {r[2] for r in rows_data}
        assert "4CB23AI073" in output_usns, "Student 1 USN 4CB23AI073 missing"
        assert "4CB23AI108" in output_usns, "Student 2 USN 4CB23AI108 missing"

        # Verify Absent and Unverified students are EXCLUDED
        assert "4CB23AI999" not in output_usns, "Absent student 4CB23AI999 must NOT appear in report!"
        assert "4CB23AI000" not in output_usns, "Unverified student 4CB23AI000 must NOT appear in report!"

        # Formula injection security check on Student 1 name
        st1_row = next(r for r in rows_data if r[2] == "4CB23AI073")
        assert st1_row[1].startswith("'="), f"Formula injection prevention failed on Student 1: {st1_row[1]}"

        # Emotion & Sentiment checks
        assert st1_row[3] == "Happy", f"Expected 'Happy' emotion for Student 1, got {st1_row[3]}"
        assert st1_row[4] == "Positive", f"Expected 'Positive' sentiment for Student 1, got {st1_row[4]}"

        # Missing Emotion & Sentiment for Student 2 should be 'N/A'
        st2_row = next(r for r in rows_data if r[2] == "4CB23AI108")
        assert st2_row[3] == "N/A", f"Expected 'N/A' emotion for Student 2, got {st2_row[3]}"
        assert st2_row[4] == "N/A", f"Expected 'N/A' sentiment for Student 2, got {st2_row[4]}"

        # 1d. Validate Page Setup & Layout Properties
        assert ws.freeze_panes == "A7", f"Freeze panes should be 'A7', got {ws.freeze_panes}"
        assert ws.page_setup.orientation == "portrait", f"Orientation should be portrait, got {ws.page_setup.orientation}"
        assert ws.page_setup.paperSize == 9, f"Paper size should be 9 (A4), got {ws.page_setup.paperSize}"
        assert ws.sheet_properties.pageSetUpPr.fitToPage is True, "FitToPage must be True"

        # Column widths check
        assert ws.column_dimensions["A"].width == 10.0
        assert ws.column_dimensions["B"].width == 24.0
        assert ws.column_dimensions["C"].width == 20.0
        assert ws.column_dimensions["D"].width == 23.0
        assert ws.column_dimensions["E"].width == 25.0

        print("PASS: Single session export returned exact template match with verified present students!")

        # -------------------------------------------------------------
        # TEST 2: Unauthorized Teacher Access (Security Check)
        # -------------------------------------------------------------
        print("\n--- TEST 2: Unauthorized Teacher Access Rejection ---")
        res_unauth = client.get(
            f"/api/attendance/export?session_id={session_a.id}",
            headers=headers_b,
        )
        assert res_unauth.status_code == 403, f"Expected 403 for unauthorized teacher, got {res_unauth.status_code}"
        print("PASS: Unauthorized teacher was correctly rejected with 403 Forbidden!")

        # -------------------------------------------------------------
        # TEST 3: Student User Role Access (Security Check)
        # -------------------------------------------------------------
        print("\n--- TEST 3: Student Role Access Rejection ---")
        res_student = client.get(
            f"/api/attendance/export?session_id={session_a.id}",
            headers=headers_student,
        )
        assert res_student.status_code == 403, f"Expected 403 for student user, got {res_student.status_code}"
        print("PASS: Student role was rejected with 403 Forbidden!")

        # -------------------------------------------------------------
        # TEST 4: Non-existent Session (404 Handling)
        # -------------------------------------------------------------
        print("\n--- TEST 4: Non-existent Session Handling ---")
        res_404 = client.get(
            f"/api/attendance/export?session_id={uuid.uuid4()}",
            headers=headers_a,
        )
        assert res_404.status_code == 404
        print("PASS: Non-existent session properly returned 404 Not Found!")

        # -------------------------------------------------------------
        # TEST 5: Empty Session Attendance Handling
        # -------------------------------------------------------------
        print("\n--- TEST 5: Empty Attendance Data Handling ---")
        empty_session = ClassSession(
            classroom_id=classroom_a.id,
            title="Empty Attendance Session",
            status=SessionStatus.COMPLETED,
            scheduled_start_time=now_utc - timedelta(days=1),
            scheduled_end_time=now_utc - timedelta(days=1, hours=-1),
        )
        db.add(empty_session)
        db.commit()
        created_session_ids.append(empty_session.id)

        res_empty = client.get(
            f"/api/attendance/export?session_id={empty_session.id}",
            headers=headers_a,
        )
        assert res_empty.status_code == 200
        wb_empty = openpyxl.load_workbook(io.BytesIO(res_empty.content))
        ws_empty = wb_empty["Present Students"]
        assert ws_empty["A4"].value == "List of the Present Students"
        assert [ws_empty.cell(row=6, column=c).value for c in range(1, 6)] == expected_headers

        # No fabricated student rows
        empty_rows = [
            ws_empty.cell(row=r, column=1).value
            for r in range(7, ws_empty.max_row + 1)
            if ws_empty.cell(row=r, column=1).value is not None
        ]
        assert len(empty_rows) == 0, f"Expected 0 student rows in empty session, found {len(empty_rows)}"
        print("PASS: Empty attendance returned properly formatted workbook without fabricated rows!")

        print("\n==================================================")
        print("ALL ATTENDANCE EXPORT TESTS PASSED SUCCESSFULLY!")
        print("==================================================")

    finally:
        # Cleanup test entities
        try:
            for s_id in created_session_ids:
                db.query(SentimentAnalysis).filter(SentimentAnalysis.session_id == s_id).delete(synchronize_session=False)
                db.query(FacialAnalysis).filter(FacialAnalysis.session_id == s_id).delete(synchronize_session=False)
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == s_id).delete(synchronize_session=False)
                db.query(SessionParticipant).filter(SessionParticipant.session_id == s_id).delete(synchronize_session=False)
                db.query(ClassSession).filter(ClassSession.id == s_id).delete(synchronize_session=False)
            for c_id in created_classroom_ids:
                db.query(Classroom).filter(Classroom.id == c_id).delete(synchronize_session=False)
            for u_id in created_user_ids:
                db.query(StudentProfile).filter(StudentProfile.user_id == u_id).delete(synchronize_session=False)
                db.query(TeacherProfile).filter(TeacherProfile.user_id == u_id).delete(synchronize_session=False)
                db.query(User).filter(User.id == u_id).delete(synchronize_session=False)
            db.commit()
        except Exception as cleanup_err:
            db.rollback()
            print(f"Cleanup error (non-fatal): {cleanup_err}")
        finally:
            db.close()


if __name__ == "__main__":
    test_attendance_export_suite()
