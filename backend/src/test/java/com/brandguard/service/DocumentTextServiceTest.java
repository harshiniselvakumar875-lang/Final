package com.brandguard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class DocumentTextServiceTest {
    private final DocumentTextService service = new DocumentTextService();

    @Test
    void extractsPdfText() throws IOException {
        String text = service.extract("campaign.pdf", pdf("guarantee 100% job placement"));
        assertTrue(text.contains("guarantee 100% job placement"));
    }

    @Test
    void extractsDocxParagraphsAndTableCells() throws IOException {
        String text = service.extract("campaign.docx", docx());
        assertTrue(text.contains("guarantee 100% job placement"));
        assertTrue(text.contains("BrightPath Academy"));
    }

    @Test
    void joinsWrappedLinesSoARuleCanMatchThePhrase() {
        assertEquals("guarantee 100% job placement", DocumentTextService.normalize("guarantee 100%\njob placement"));
    }

    @Test
    void rejectsAnUnreadablePdf() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.extract("notes.pdf", new byte[] {1, 2, 3}));
        assertEquals(400, error.getStatusCode().value());
    }

    private static byte[] pdf(String line) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(PDType1Font.HELVETICA, 12);
                stream.newLineAtOffset(50, 700);
                stream.showText(line);
                stream.endText();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }

    private static byte[] docx() throws IOException {
        try (XWPFDocument document = new XWPFDocument()) {
            document.createParagraph().createRun().setText("guarantee 100% job placement");
            document.createTable(1, 1).getRow(0).getCell(0).setText("BrightPath Academy");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.write(output);
            return output.toByteArray();
        }
    }
}
