import os
import sys
import cv2
import numpy as np

# Ensure project root is on sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from ai.facial_emotion import FacialEmotionAnalyzer, FERPLUS_CLASSES

def run_diagnosis():
    debug_dir = os.path.join(project_root, "debug")
    analyzer = FacialEmotionAnalyzer()
    
    samples = ["sample-1.jpg", "sample-2.jpg", "sample-3.jpg"]
    
    for idx, sample_name in enumerate(samples, 1):
        sample_path = os.path.join(debug_dir, sample_name)
        print(f"\n=================== SAMPLE {idx} ({sample_name}) ===================")
        if not os.path.exists(sample_path):
            print(f"File {sample_path} does not exist in {debug_dir}")
            continue
            
        img = cv2.imread(sample_path)
        if img is None:
            print(f"Failed to load image at {sample_path}")
            continue
            
        h, w, c = img.shape
        file_size = os.path.getsize(sample_path)
        print(f"Captured Image Dimensions: {w}x{h} ({c} channels)")
        print(f"File Size: {file_size / 1024:.2f} KB ({file_size} bytes)")
        
        res = analyzer.analyze_frame(img)
        print(f"Valid Input: {res.get('valid_input')}")
        print(f"Face Detected: {res.get('face_detected')}")
        print(f"Attentiveness Score: {res.get('attentiveness_score')}")
        print(f"Head Pose: {res.get('head_pose')}")
        print(f"Dominant Emotion: {res.get('dominant_emotion')}")
        print(f"Raw Dominant Emotion: {res.get('raw_dominant')}")
        print(f"Confidence: {res.get('confidence')}")
        
        if res.get('face_bbox'):
            bbox = res['face_bbox']
            print(f"Face Bounding Box: {bbox}")
            x, y, bw, bh = bbox['x'], bbox['y'], bbox['w'], bbox['h']
            face_crop = img[y:y+bh, x:x+bw]
            crop_path = os.path.join(debug_dir, f"crop-{idx}.jpg")
            cv2.imwrite(crop_path, face_crop)
            print(f"Saved Face Crop to {crop_path} (crop dimensions: {bw}x{bh})")
        else:
            print("No face bounding box available.")

        print("\nComplete FERPlus Probabilities:")
        probs = res.get('emotion_probabilities', {})
        for cls in ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt"]:
            mapped_key = cls
            if cls == "happiness":
                mapped_key = "happy"
            elif cls == "sadness":
                mapped_key = "sad"
            elif cls == "anger":
                mapped_key = "angry"
            val = probs.get(mapped_key, 0.0)
            print(f"  {cls:<12}: {val * 100:6.2f}%  (prob = {val:.4f})")

if __name__ == "__main__":
    run_diagnosis()
