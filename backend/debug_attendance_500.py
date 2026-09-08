import requests
import json
import base64
import numpy as np
import cv2

BASE_URL = "http://localhost:8000/api"

def debug_500_error():
    print("=" * 60)
    print("DEBUGGING HTTP 500 ON /api/attendance/verify")
    print("=" * 60)

    # 1. Login as Student
    print("\n[1] Logging in as student@edusense.ai...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "student@edusense.ai",
        "password": "Password123!"
    })
    
    if login_res.status_code != 200:
        print(f"Login failed: {login_res.status_code} - {login_res.text}")
        return

    data = login_res.json()
    token = data["access_token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Origin": "http://localhost:5173"
    }
    print("✓ Logged in. Token acquired.")

    # 2. Get active session or classroom
    print("\n[2] Fetching classrooms & active session...")
    class_res = requests.get(f"{BASE_URL}/classrooms/", headers=headers)
    if class_res.status_code != 200 or not class_res.json():
        print(f"No classrooms found: {class_res.status_code} - {class_res.text}")
        return
    
    classrooms = class_res.json()
    classroom_id = classrooms[0]["id"]
    print(f"Using classroom_id: {classroom_id}")

    # Check active session
    active_res = requests.get(f"{BASE_URL}/classrooms/{classroom_id}/active-session", headers=headers)
    if active_res.status_code != 200:
        print(f"No active session for classroom {classroom_id}: {active_res.status_code} - {active_res.text}")
        print("Note: Session must be started by teacher to be ACTIVE.")
        return

    session_data = active_res.json()
    session_id = session_data["id"]
    print(f"Using active session_id: {session_id}")

    # 3. Create a test webcam frame
    print("\n[3] Sending sample frame to POST /api/attendance/verify...")
    img = np.ones((480, 640, 3), dtype=np.uint8) * 220
    cx, cy = 320, 240
    cv2.ellipse(img, (cx, cy), (110, 140), 0, 0, 360, (180, 150, 120), -1)
    cv2.circle(img, (cx - 40, cy - 30), 14, (255, 255, 255), -1)
    cv2.circle(img, (cx + 40, cy - 30), 14, (255, 255, 255), -1)
    cv2.circle(img, (cx - 40, cy - 30), 6, (40, 40, 40), -1)
    cv2.circle(img, (cx + 40, cy - 30), 6, (40, 40, 40), -1)

    _, buf = cv2.imencode('.jpg', img)
    frame_b64 = base64.b64encode(buf).decode('utf-8')

    res = requests.post(f"{BASE_URL}/attendance/verify", headers=headers, json={
        "session_id": session_id,
        "image_base64": frame_b64
    })

    print(f"\nResponse Status Code: {res.status_code}")
    print(f"Response Headers: {dict(res.headers)}")
    print(f"Response Body: {res.text}")

if __name__ == "__main__":
    debug_500_error()
