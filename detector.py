"""
AI Video Detection Module
Checks if a video is AI-generated using TwelveLabs API and metadata analysis
"""

from deffcode import Sourcer
from twelvelabs import TwelveLabs
from config import TWELVELABS_API_KEY, VIDEO_PATH


def get_video_metadata(video_path):
    """
    Extract metadata from video file
    Returns: dict with video metadata
    """
    try:
        sourcer = Sourcer(video_path).probe_stream()
        metadata = sourcer.retrieve_metadata()
        return metadata
    except Exception as e:
        print(f"Error extracting metadata: {e}")
        return None


def is_metadata_real(metadata):
    """
    Check if metadata indicates the video is real (not AI)
    Returns: True if metadata suggests real video, False otherwise
    """
    if not metadata:
        return False
    
    # Check for signs of authenticity in metadata
    # This is a basic check - you can expand this
    real_indicators = [
        'device' in str(metadata).lower(),
        'camera' in str(metadata).lower(),
        'recording' in str(metadata).lower()
    ]
    
    return any(real_indicators)


def check_with_twelvelabs(video_path):
    """
    Use TwelveLabs API to analyze video for AI content
    Returns: API response with detection results
    """
    try:
        client = TwelveLabs(api_key=TWELVELABS_API_KEY)
        # You'll need to adjust this based on TwelveLabs API documentation
        # This is a placeholder
        print(f"Analyzing video with TwelveLabs: {video_path}")
        return None
    except Exception as e:
        print(f"Error with TwelveLabs API: {e}")
        return None


def detect_ai_video(video_path):
    """
    Main detection function
    Logic: Only use TwelveLabs API if metadata doesn't prove it's real
    Returns: dict with detection results
    """
    print(f"Analyzing video: {video_path}")
    print("-" * 50)
    
    # Step 1: Get metadata
    metadata = get_video_metadata(video_path)
    print(f"Metadata: {metadata}")
    
    # Step 2: Check if metadata proves it's real
    if is_metadata_real(metadata):
        print("✓ Metadata indicates this is a REAL video")
        return {
            'is_ai': False,
            'reason': 'Metadata proves authenticity',
            'metadata': metadata
        }
    
    # Step 3: If metadata doesn't prove it's real, use TwelveLabs API
    print("⚠ Metadata doesn't prove authenticity, checking with TwelveLabs API...")
    api_result = check_with_twelvelabs(video_path)
    
    return {
        'is_ai': True,  # Default to AI if we can't verify it's real
        'reason': 'Could not verify authenticity',
        'metadata': metadata,
        'api_result': api_result
    }
