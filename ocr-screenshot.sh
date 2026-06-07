#!/bin/bash
TMP_IMG="/tmp/ocr_shot.png"
TMP_TXT="/tmp/ocr_out"

# 1. Clear out any older run files
rm -f "$TMP_IMG" "${TMP_TXT}.txt" 2>/dev/null

# 2. Fire Spectacle's region mode natively
# We drop the broken background flags so your crosshairs are GUARANTEED to fire up
spectacle -r -o "$TMP_IMG" &
SPECTACLE_PID=$!

# 3. Wait for you to finish dragging your box
# Once the image hits /tmp, we instantly kill the leftover Spectacle GUI window 
# before it can even try to pop up the "Save As" menu on your screen!
while [ ! -s "$TMP_IMG" ]; do
    sleep 0.1
    # If the process dies (user hit Escape), exit cleanly
    if ! kill -0 $SPECTACLE_PID 2>/dev/null; then
        exit 1
    fi
done

# Instantly close the background GUI window loop
kill $SPECTACLE_PID 2>/dev/null

# 4. Extract text from your perfect target crop box
tesseract "$TMP_IMG" "$TMP_TXT" --psm 6 -l eng 2>/dev/null

# 5. Clean up layout trails and push straight to your clipboard
if [ -f "${TMP_TXT}.txt" ]; then
    sed -E 's/[[:space:]]+$//' "${TMP_TXT}.txt" | awk 'NF' | wl-copy
    notify-send "Text Snitched!" "Ready to paste (Clean layout)."
else
    notify-send "OCR Error" "Could not read text from selection."
fi

# 6. Keep your storage clean
rm -f "$TMP_IMG" "${TMP_TXT}.txt" 2>/dev/null
