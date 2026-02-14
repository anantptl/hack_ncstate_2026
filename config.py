import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# API Configuration
TWELVELABS_API_KEY = os.getenv('TWELVELABS_API_KEY')
VIDEO_PATH = os.getenv('VIDEO_PATH')

# Validation
if not TWELVELABS_API_KEY:
    raise ValueError("TWELVELABS_API_KEY not found in .env file")
if not VIDEO_PATH:
    raise ValueError("VIDEO_PATH not found in .env file")
