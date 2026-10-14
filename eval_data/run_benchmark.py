import os
import sys
import csv
import time
import json
import numpy as np
import cv2
from collections import Counter
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    log_loss,
)
from scipy.optimize import minimize

PROJECT_ROOT = "/Users/apple/Desktop/Edusense_AI"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import onnxruntime as ort
from emotiefflib.facial_analysis import EmotiEffLibRecognizer

CLASSES_8 = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt"]
CLASSES_EMOTIEFF = ["Anger", "Contempt", "Disgust", "Fear", "Happiness", "Neutral", "Sadness", "Surprise"]

# Canonical class index mapping
NAME_TO_IDX = {c: i for i, c in enumerate(CLASSES_8)}

def load_clean_dataset():
    ferplus_csv = os.path.join(PROJECT_ROOT, "eval_data", "fer2013new.csv")
    fer_test_csv = "/Users/apple/.cache/huggingface/hub/datasets--chitradrishti--fer2013/snapshots/4ad26b38d1dcc1c3891d841a48758653b6c67105/fer2013/test.csv"
    
    gt_map = {}
    with open(ferplus_csv, "r") as f:
        reader = csv.reader(f)
        next(reader)
        for idx, row in enumerate(reader):
            usage = row[0]
            if usage == "PublicTest":
                votes = [int(v) for v in row[2:10]]
                unknown = int(row[10])
                nf = int(row[11])
                max_v = max(votes)
                # Clean sample criteria: majority >= 3, no tie, not unknown/not-face
                if max_v >= 3 and votes.count(max_v) == 1 and unknown <= max_v and nf <= max_v:
                    gt_map[idx] = CLASSES_8[votes.index(max_v)]
                    
    samples = []
    with open(fer_test_csv, "r") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            idx = int(row[0])
            if idx in gt_map:
                pixels = np.array([int(p) for p in row[2].split()], dtype=np.uint8).reshape((48, 48))
                bgr = cv2.cvtColor(pixels, cv2.COLOR_GRAY2BGR)
                samples.append({
                    "id": idx,
                    "image": bgr,
                    "label": gt_map[idx],
                    "class_idx": NAME_TO_IDX[gt_map[idx]],
                })
    return samples

def compute_ece(probs, labels, n_bins=10):
    """Computes Expected Calibration Error."""
    confidences = np.max(probs, axis=1)
    predictions = np.argmax(probs, axis=1)
    accuracies = (predictions == labels)
    
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        in_bin = (confidences > bin_boundaries[i]) & (confidences <= bin_boundaries[i + 1])
        prop_in_bin = np.mean(in_bin)
        if prop_in_bin > 0:
            accuracy_in_bin = np.mean(accuracies[in_bin])
            avg_confidence_in_bin = np.mean(confidences[in_bin])
            ece += np.abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin
    return float(ece)

class ModelEvaluator:
    def __init__(self):
        # FERPlus session
        ferplus_path = os.path.join(PROJECT_ROOT, "ai", "models", "emotion-ferplus.onnx")
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.ferplus_sess = ort.InferenceSession(ferplus_path, opts)
        self.ferplus_in = self.ferplus_sess.get_inputs()[0].name
        
        # EmotiEffLib models
        self.vgaf_rec = EmotiEffLibRecognizer(engine="onnx", model_name="enet_b0_8_best_vgaf")
        self.afew_rec = EmotiEffLibRecognizer(engine="onnx", model_name="enet_b0_8_best_afew")
        
    def infer_ferplus_raw(self, bgr):
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY) if bgr.ndim == 3 else bgr
        resized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
        tensor = resized.astype(np.float32).reshape(1, 1, 64, 64)
        out = self.ferplus_sess.run(None, {self.ferplus_in: tensor})[0][0]
        # Softmax
        exp_z = np.exp(out - np.max(out))
        probs = exp_z / np.sum(exp_z)
        # FERPLUS_CLASSES: neutral, happy, surprise, sad, angry, disgust, fear, contempt
        fer_cls = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt"]
        # Align with CLASSES_8: neutral, happiness, surprise, sadness, anger, disgust, fear, contempt
        return out, probs

    def infer_emotieff_raw(self, rec, bgr):
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        labels, scores = rec.predict_emotions(rgb, logits=True)
        logits_arr = scores[0]
        exp_z = np.exp(logits_arr - np.max(logits_arr))
        probs_raw = exp_z / np.sum(exp_z)
        # EMOTIEFF_CLASSES: Anger(0), Contempt(1), Disgust(2), Fear(3), Happiness(4), Neutral(5), Sadness(6), Surprise(7)
        # Reorder to CLASSES_8: neutral, happiness, surprise, sadness, anger, disgust, fear, contempt
        reordered_logits = np.array([
            logits_arr[5], # neutral
            logits_arr[4], # happiness
            logits_arr[7], # surprise
            logits_arr[6], # sadness
            logits_arr[0], # anger
            logits_arr[2], # disgust
            logits_arr[3], # fear
            logits_arr[1], # contempt
        ], dtype=np.float32)
        exp_re = np.exp(reordered_logits - np.max(reordered_logits))
        reordered_probs = exp_re / np.sum(exp_re)
        return reordered_logits, reordered_probs

def run_benchmark():
    print("Loading clean dataset...")
    samples = load_clean_dataset()
    print(f"Total clean samples loaded: {len(samples)}")
    
    labels = [s["class_idx"] for s in samples]
    val_samples, test_samples = train_test_split(
        samples, test_size=0.50, random_state=42, stratify=labels
    )
    print(f"Validation split: {len(val_samples)} samples")
    print(f"Final Test split: {len(test_samples)} samples")
    print("Validation class distribution:", Counter(CLASSES_8[s["class_idx"]] for s in val_samples))
    print("Test class distribution:      ", Counter(CLASSES_8[s["class_idx"]] for s in test_samples))
    
    evaluator = ModelEvaluator()
    
    # -------------------------------------------------------------
    # PHASE 1 & 4: VALIDATION SET MODEL COMPARISON & ENSEMBLE TEST
    # -------------------------------------------------------------
    print("\n" + "="*70)
    print("PHASE 4: VALIDATION SET BENCHMARK & CANDIDATE MODEL SELECTION")
    print("="*70)
    
    val_y = np.array([s["class_idx"] for s in val_samples])
    
    fer_val_logits, fer_val_probs = [], []
    vgaf_val_logits, vgaf_val_probs = [], []
    afew_val_logits, afew_val_probs = [], []
    
    fer_latencies, vgaf_latencies, afew_latencies = [], [], []
    
    for s in val_samples:
        img = s["image"]
        
        t0 = time.perf_counter()
        fl, fp = evaluator.infer_ferplus_raw(img)
        fer_latencies.append((time.perf_counter() - t0) * 1000.0)
        fer_val_logits.append(fl)
        fer_val_probs.append(fp)
        
        t0 = time.perf_counter()
        vl, vp = evaluator.infer_emotieff_raw(evaluator.vgaf_rec, img)
        vgaf_latencies.append((time.perf_counter() - t0) * 1000.0)
        vgaf_val_logits.append(vl)
        vgaf_val_probs.append(vp)
        
        t0 = time.perf_counter()
        al, ap = evaluator.infer_emotieff_raw(evaluator.afew_rec, img)
        afew_latencies.append((time.perf_counter() - t0) * 1000.0)
        afew_val_logits.append(al)
        afew_val_probs.append(ap)
        
    fer_val_probs = np.array(fer_val_probs)
    vgaf_val_probs = np.array(vgaf_val_probs)
    afew_val_probs = np.array(afew_val_probs)
    
    fer_val_preds = np.argmax(fer_val_probs, axis=1)
    vgaf_val_preds = np.argmax(vgaf_val_probs, axis=1)
    afew_val_preds = np.argmax(afew_val_probs, axis=1)
    
    # Ensemble: Weighted blend of FERPlus + EmotiEffLib
    # Test blend weights w from 0.0 to 1.0
    best_w = 1.0
    best_ens_acc = 0.0
    for w in np.linspace(0.0, 1.0, 11):
        ens_probs = w * fer_val_probs + (1 - w) * vgaf_val_probs
        acc = accuracy_score(val_y, np.argmax(ens_probs, axis=1))
        if acc > best_ens_acc:
            best_ens_acc = acc
            best_w = w
            
    print(f"\n--- Model Comparison on Validation Split (N={len(val_samples)}) ---")
    models_summary = [
        ("FERPlus ONNX", fer_val_preds, fer_val_probs, fer_latencies),
        ("EmotiEffLib (VGAF)", vgaf_val_preds, vgaf_val_probs, vgaf_latencies),
        ("EmotiEffLib (AFEW)", afew_val_preds, afew_val_probs, afew_latencies),
    ]
    for name, preds, probs, lat in models_summary:
        acc = accuracy_score(val_y, preds)
        bal_acc = balanced_accuracy_score(val_y, preds)
        macro_f1 = f1_score(val_y, preds, average="macro", zero_division=0)
        ece = compute_ece(probs, val_y)
        avg_lat = np.mean(lat)
        print(f"Model: {name}")
        print(f"  Raw Accuracy:      {acc*100:.2f}%")
        print(f"  Balanced Accuracy: {bal_acc*100:.2f}%")
        print(f"  Macro-F1 Score:    {macro_f1*100:.2f}%")
        print(f"  Calibration ECE:   {ece*100:.2f}%")
        print(f"  CPU Latency:       {avg_lat:.2f} ms/frame")
        
    print(f"\nEnsemble Evaluation (FERPlus + VGAF):")
    print(f"  Best FERPlus Weight w={best_w:.2f} -> Accuracy: {best_ens_acc*100:.2f}%")
    if best_w >= 0.99:
        print("  => Conclusion: Single FERPlus model strictly outperforms the ensemble (Ensemble degrades performance due to VGAF skew).")
    
    # -------------------------------------------------------------
    # TEMPERATURE SCALING CALIBRATION ON VALIDATION SPLIT
    # -------------------------------------------------------------
    print("\n--- Confidence Calibration Tuning (Validation Split) ---")
    fer_val_logits = np.array(fer_val_logits)
    
    def nll_func(T):
        scaled_logits = fer_val_logits / T[0]
        exp_z = np.exp(scaled_logits - np.max(scaled_logits, axis=1, keepdims=True))
        p = exp_z / np.sum(exp_z, axis=1, keepdims=True)
        # NLL loss
        p_y = p[np.arange(len(val_y)), val_y]
        return -np.mean(np.log(np.clip(p_y, 1e-12, 1.0)))
        
    res_opt = minimize(nll_func, [1.0], method="Nelder-Mead")
    opt_temp = float(res_opt.x[0])
    
    # Calculate calibrated ECE
    scaled_val_logits = fer_val_logits / opt_temp
    exp_scaled = np.exp(scaled_val_logits - np.max(scaled_val_logits, axis=1, keepdims=True))
    calib_val_probs = exp_scaled / np.sum(exp_scaled, axis=1, keepdims=True)
    
    ece_before = compute_ece(fer_val_probs, val_y)
    ece_after = compute_ece(calib_val_probs, val_y)
    print(f"Optimal Temperature T: {opt_temp:.4f}")
    print(f"ECE Before Calibration: {ece_before*100:.2f}%")
    print(f"ECE After Calibration:  {ece_after*100:.2f}% (Improvement: -{(ece_before - ece_after)*100:.2f}%)")

    # -------------------------------------------------------------
    # REJECTION THRESHOLD VS COVERAGE SWEEP (VALIDATION SPLIT)
    # -------------------------------------------------------------
    print("\n--- Threshold vs Accuracy & Coverage Curve (Validation Split) ---")
    print(f"{'Threshold':>10} | {'Coverage':>10} | {'Accuracy':>10} | {'Rejection':>10}")
    print("-" * 50)
    conf_val = np.max(calib_val_probs, axis=1)
    for tau in [0.0, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.90, 0.95]:
        keep = conf_val >= tau
        cov = np.mean(keep)
        if cov > 0:
            acc_kept = accuracy_score(val_y[keep], np.argmax(calib_val_probs[keep], axis=1))
        else:
            acc_kept = 0.0
        print(f"{tau:>10.2f} | {cov*100:>9.1f}% | {acc_kept*100:>9.2f}% | {(1-cov)*100:>9.1f}%")

    # -------------------------------------------------------------
    # PHASE 3: UNTOUCHED FINAL TEST SET EVALUATION
    # -------------------------------------------------------------
    print("\n" + "="*70)
    print(f"PHASE 3: UNTOUCHED FINAL TEST SET EVALUATION (N={len(test_samples)})")
    print("="*70)
    
    test_y = np.array([s["class_idx"] for s in test_samples])
    fer_test_logits, fer_test_probs = [], []
    vgaf_test_probs = []
    test_latencies = []
    
    for s in test_samples:
        img = s["image"]
        t0 = time.perf_counter()
        fl, fp = evaluator.infer_ferplus_raw(img)
        test_latencies.append((time.perf_counter() - t0) * 1000.0)
        fer_test_logits.append(fl)
        fer_test_probs.append(fp)
        
        _, vp = evaluator.infer_emotieff_raw(evaluator.vgaf_rec, img)
        vgaf_test_probs.append(vp)
        
    fer_test_logits = np.array(fer_test_logits)
    fer_test_probs = np.array(fer_test_probs)
    vgaf_test_probs = np.array(vgaf_test_probs)
    
    # Apply calibrated temperature learned from validation set
    scaled_test_logits = fer_test_logits / opt_temp
    exp_test_s = np.exp(scaled_test_logits - np.max(scaled_test_logits, axis=1, keepdims=True))
    calib_test_probs = exp_test_s / np.sum(exp_test_s, axis=1, keepdims=True)
    
    fer_test_preds = np.argmax(calib_test_probs, axis=1)
    vgaf_test_preds = np.argmax(vgaf_test_probs, axis=1)
    
    # 1. Overall Unfiltered Metrics on Final Test Set
    test_acc_fer = accuracy_score(test_y, fer_test_preds)
    test_bal_acc_fer = balanced_accuracy_score(test_y, fer_test_preds)
    test_macro_f1_fer = f1_score(test_y, fer_test_preds, average="macro", zero_division=0)
    test_ece_fer = compute_ece(calib_test_probs, test_y)
    
    test_acc_vgaf = accuracy_score(test_y, vgaf_test_preds)
    test_bal_acc_vgaf = balanced_accuracy_score(test_y, vgaf_test_preds)
    test_macro_f1_vgaf = f1_score(test_y, vgaf_test_preds, average="macro", zero_division=0)
    test_ece_vgaf = compute_ece(vgaf_test_probs, test_y)
    
    print("\n=== FINAL TEST SET SUMMARY (Zero-Threshold / Unfiltered) ===")
    print(f"FERPlus (Calibrated T={opt_temp:.3f}):")
    print(f"  Overall Accuracy:      {test_acc_fer*100:.2f}%")
    print(f"  Balanced Accuracy:     {test_bal_acc_fer*100:.2f}%")
    print(f"  Macro-F1 Score:        {test_macro_f1_fer*100:.2f}%")
    print(f"  Expected Calib Error:  {test_ece_fer*100:.2f}%")
    print(f"  Mean Latency (CPU):    {np.mean(test_latencies):.2f} ms (p95: {np.percentile(test_latencies, 95):.2f} ms)")
    print(f"\nEmotiEffLib (VGAF Baseline):")
    print(f"  Overall Accuracy:      {test_acc_vgaf*100:.2f}%")
    print(f"  Balanced Accuracy:     {test_bal_acc_vgaf*100:.2f}%")
    print(f"  Macro-F1 Score:        {test_macro_f1_vgaf*100:.2f}%")
    print(f"  Expected Calib Error:  {test_ece_vgaf*100:.2f}%")
    
    # 2. Detailed Per-Class Performance on Final Test Set
    print("\n=== PER-CLASS PERFORMANCE ON FINAL TEST SET (8 CLASSES) ===")
    cr_dict = classification_report(test_y, fer_test_preds, target_names=CLASSES_8, output_dict=True, zero_division=0)
    print(f"{'Class':<12} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10} | {'Support':<8}")
    print("-" * 60)
    for c in CLASSES_8:
        info = cr_dict[c]
        print(f"{c:<12} | {info['precision']:<10.3f} | {info['recall']:<10.3f} | {info['f1-score']:<10.3f} | {int(info['support']):<8}")
    print("-" * 60)
    print(f"{'Macro-Avg':<12} | {cr_dict['macro avg']['precision']:<10.3f} | {cr_dict['macro avg']['recall']:<10.3f} | {cr_dict['macro avg']['f1-score']:<10.3f} | {len(test_y):<8}")
    print(f"{'Weighted-Avg':<12} | {cr_dict['weighted avg']['precision']:<10.3f} | {cr_dict['weighted avg']['recall']:<10.3f} | {cr_dict['weighted avg']['f1-score']:<10.3f} | {len(test_y):<8}")
    
    # 3. Confusion Matrix & Most Frequent Confusions
    cm = confusion_matrix(test_y, fer_test_preds)
    print("\n=== CONFUSION MATRIX (8x8) ===")
    print("True \\ Pred:\t" + "\t".join([c[:4] for c in CLASSES_8]))
    for i, row in enumerate(cm):
        print(f"{CLASSES_8[i][:7]:<7}\t" + "\t".join(str(v) for v in row))
        
    print("\n=== MOST FREQUENT CONFUSIONS PER CLASS ===")
    for i, c in enumerate(CLASSES_8):
        row = cm[i].copy()
        row[i] = 0 # zero out correct
        top_err_idx = int(np.argmax(row))
        err_count = row[top_err_idx]
        total_cls = cm[i].sum()
        print(f"  - {c.upper():<10}: Most confused with {CLASSES_8[top_err_idx].upper()} ({err_count}/{total_cls} errors, {err_count/total_cls*100:.1f}%)")
        
    # 4. Final Calibrated Trade-Offs on Test Set
    print("\n=== FINAL TEST SET ACCURACY AT CALIBRATED THRESHOLDS ===")
    test_conf = np.max(calib_test_probs, axis=1)
    for tau in [0.0, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.90]:
        keep = test_conf >= tau
        cov = np.mean(keep)
        if cov > 0:
            acc_kept = accuracy_score(test_y[keep], fer_test_preds[keep])
        else:
            acc_kept = 0.0
        print(f"  Threshold >= {tau:.2f} : Coverage = {cov*100:5.1f}% | Accuracy on Accepted = {acc_kept*100:5.2f}% | Rejection = {(1-cov)*100:5.1f}%")

    # Output JSON summary for artifact reporting
    summary = {
        "val_size": len(val_samples),
        "test_size": len(test_samples),
        "opt_temperature": opt_temp,
        "ferplus_test_accuracy": test_acc_fer,
        "ferplus_test_balanced_acc": test_bal_acc_fer,
        "ferplus_test_macro_f1": test_macro_f1_fer,
        "ferplus_test_ece": test_ece_fer,
        "vgaf_test_accuracy": test_acc_vgaf,
        "vgaf_test_balanced_acc": test_bal_acc_vgaf,
        "vgaf_test_macro_f1": test_macro_f1_vgaf,
        "vgaf_test_ece": test_ece_vgaf,
        "confusion_matrix": cm.tolist(),
        "per_class": cr_dict,
    }
    with open("eval_data/benchmark_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    print("\nBenchmark results saved to eval_data/benchmark_results.json")

if __name__ == "__main__":
    run_benchmark()
