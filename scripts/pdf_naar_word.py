"""Zet een PDF om naar een Word-bestand met pdf2docx.

Gebruik: python3 pdf_naar_word.py invoer.pdf uitvoer.docx
"""
import logging
import sys

logging.disable(logging.CRITICAL)


def main():
    if len(sys.argv) != 3:
        print("gebruik: pdf_naar_word.py invoer.pdf uitvoer.docx", file=sys.stderr)
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]

    import fitz  # PyMuPDF, komt mee met pdf2docx

    doc = fitz.open(src)
    if doc.needs_pass:
        print("VERSLEUTELD", file=sys.stderr)
        sys.exit(4)
    doc.close()

    from pdf2docx import Converter

    cv = Converter(src)
    try:
        cv.convert(dst, multi_processing=False)
    finally:
        cv.close()


if __name__ == "__main__":
    main()
