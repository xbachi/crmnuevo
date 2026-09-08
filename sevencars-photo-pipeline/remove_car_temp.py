#!/usr/bin/env python3
"""
Temporal script to remove cars from bg_2.jpg and bg_3.jpg using fal.ai FLUX Fill.
Requires manual mask creation before running.
"""

import os
import fal_client
from pathlib import Path

# Paths
BG_DIR = Path("/home/seb/fotosseven/sevencars-photo-pipeline/backgrounds")
IMAGES = ["bg_2.jpg", "bg_3.jpg"]

# You need to create masks manually:
# - bg_2_mask.jpg (white where car is, black elsewhere)
# - bg_3_mask.jpg (white where car is, black elsewhere)

def remove_car(image_path: Path, mask_path: Path, output_path: Path):
    """Remove car using fal.ai FLUX Fill"""

    if not mask_path.exists():
        print(f"❌ Mask not found: {mask_path}")
        print("Create a mask image (white=car area, black=keep)")
        return

    # Upload images to fal.ai storage first
    print(f"Uploading {image_path.name}...")
    image_url = fal_client.upload_file(str(image_path))
    mask_url = fal_client.upload_file(str(mask_path))

    print(f"Processing with FLUX Fill...")
    result = fal_client.subscribe(
        "fal-ai/flux-pro/v1/fill",
        arguments={
            "image_url": image_url,
            "mask_url": mask_url,
            "prompt": "clean studio background, empty photography studio floor, no cars, no objects",
        }
    )

    # Download result
    output_url = result["images"][0]["url"]
    print(f"Downloading to {output_path.name}...")

    import requests
    response = requests.get(output_url)
    output_path.write_bytes(response.content)
    print(f"✅ Saved: {output_path}")

def main():
    # Check API key (FAL_API_KEY is accepted as a fallback; same key the Node pipeline uses)
    if not os.getenv("FAL_KEY") and os.getenv("FAL_API_KEY"):
        os.environ["FAL_KEY"] = os.environ["FAL_API_KEY"]
    if not os.getenv("FAL_KEY"):
        print("❌ Set FAL_KEY environment variable")
        return

    for img_name in IMAGES:
        image_path = BG_DIR / img_name
        mask_name = img_name.replace(".jpg", "_mask.jpg")
        mask_path = BG_DIR / mask_name
        output_name = img_name.replace(".jpg", "_clean.jpg")
        output_path = BG_DIR / output_name

        print(f"\n{'='*60}")
        print(f"Processing: {img_name}")
        print(f"{'='*60}")

        if not image_path.exists():
            print(f"❌ Image not found: {image_path}")
            continue

        remove_car(image_path, mask_path, output_path)

if __name__ == "__main__":
    main()
