from PIL import Image, ImageChops

def crop_and_square(image_path, output_path):
    img = Image.open(image_path).convert("RGB")
    
    # Find bounding box of non-black pixels
    # Create a completely black image of the same size
    bg = Image.new(img.mode, img.size, (0, 0, 0))
    diff = ImageChops.difference(img, bg)
    diff = ImageChops.add(diff, diff, 2.0, -100)
    bbox = diff.getbbox()
    
    if bbox:
        # Crop to the exact non-black content
        cropped = img.crop(bbox)
        
        # We want to make it a square by adding black padding on the shorter dimension
        w, h = cropped.size
        size = max(w, h)
        # Add a small 10% padding
        padded_size = int(size * 1.2)
        
        square_img = Image.new("RGB", (padded_size, padded_size), (0, 0, 0))
        offset = ((padded_size - w) // 2, (padded_size - h) // 2)
        square_img.paste(cropped, offset)
        
        # Resize to standard favicon size for crispness
        favicon = square_img.resize((256, 256), Image.Resampling.LANCZOS)
        favicon.save(output_path, format="PNG")
        print("Success")
    else:
        print("Empty image")

crop_and_square(r'C:\Users\SAJID\.gemini\antigravity\brain\904db970-b62d-4cb7-b252-364e017cf58c\.user_uploaded\media_1790783886140.png', 'public/favicon.png')
