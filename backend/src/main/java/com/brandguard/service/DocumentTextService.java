package com.brandguard.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DocumentTextService {
    static final int MAX_CHARACTERS = 50_000;

    public String extract(String filename, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file is empty.");
        }
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".pdf")) return extractPdf(bytes);
        if (name.endsWith(".docx")) return extractDocx(bytes);
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload a .pdf or .docx file.");
    }

    private String extractPdf(byte[] bytes) {
        try (PDDocument document = PDDocument.load(bytes)) {
            return requireText(normalize(new PDFTextStripper().getText(document)));
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (InvalidPasswordException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This PDF is password-protected. Upload an unprotected PDF.");
        } catch (IOException | RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This PDF could not be read. Upload a valid text-based PDF.");
        }
    }

    private String extractDocx(byte[] bytes) {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder text = new StringBuilder();
            for (IBodyElement element : document.getBodyElements()) {
                if (element instanceof XWPFParagraph paragraph) {
                    appendLine(text, paragraph.getText());
                } else if (element instanceof XWPFTable table) {
                    for (XWPFTableRow row : table.getRows()) {
                        for (XWPFTableCell cell : row.getTableCells()) {
                            appendLine(text, cell.getText());
                        }
                    }
                }
            }
            return requireText(normalize(text.toString()));
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This DOCX file could not be read. Upload a valid .docx document.");
        }
    }

    private static void appendLine(StringBuilder text, String line) {
        if (line == null || line.isBlank()) return;
        if (!text.isEmpty()) text.append('\n');
        text.append(line.trim());
    }

    static String normalize(String text) {
        String unified = text.replace("\r\n", "\n").replace('\r', '\n').replace('\u00A0', ' ');
        String joined = unified.replaceAll("(?<!\\n)\\n(?!\\n)", " ");
        return joined.replaceAll("[ \\t\\f]{2,}", " ").replaceAll("\\n{3,}", "\n\n").trim();
    }

    private static String requireText(String text) {
        if (text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No text could be extracted. The file may be scanned or empty.");
        }
        if (text.length() > MAX_CHARACTERS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Extracted text is longer than 50,000 characters. Check a shorter section.");
        }
        return text;
    }
}
