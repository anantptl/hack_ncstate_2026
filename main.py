"""
Main entry point for AI Video Detector
Run this file to check if a video is AI-generated
"""

from config import VIDEO_PATH
from detector import detect_ai_video


def main():
    print("=" * 50)
    print("AI VIDEO DETECTOR")
    print("=" * 50)
    print()
    
    # Run detection
    result = detect_ai_video(VIDEO_PATH)
    
    # Display results
    print()
    print("-" * 50)
    print("RESULTS:")
    print("-" * 50)
    print(f"Is AI Generated: {result['is_ai']}")
    print(f"Reason: {result['reason']}")
    print()


if __name__ == "__main__":
    main()
