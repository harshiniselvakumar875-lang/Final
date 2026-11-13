package com.brandguard.service;

import com.brandguard.api.ApiModels.ClaimItemView;
import com.brandguard.api.ApiModels.ClaimStatus;
import com.brandguard.api.ApiModels.ClaimVerificationView;
import com.brandguard.api.ApiModels.RuleView;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ClaimVerificationServiceTest {

    private final ClaimVerificationService service = new ClaimVerificationService();

    private final List<RuleView> rules = List.of(
            new RuleView(
                    "fact-018",
                    "FACT_CONFLICT",
                    "Factual conflict",
                    "HIGH",
                    "guarantee 100% job placement",
                    "The approved fact explicitly says no placement guarantee is offered.",
                    "BrightPath Institute provides career guidance and placement assistance. No placement guarantee is offered.",
                    "provides career guidance and placement assistance"
            ),
            new RuleView(
                    "fact-021",
                    "FACT_CONFLICT",
                    "Factual conflict",
                    "HIGH",
                    "6-month course",
                    "The flagship programme duration is 12 months, not 6 months.",
                    "The flagship programme runs for 12 months.",
                    "12-month programme"
            )
    );

    @Test
    void detectsContradictedClaimsAgainstApprovedFacts() {
        String draft = "Join us because we guarantee 100% job placement right after graduation. We are proud of our students.";
        ClaimVerificationView result = service.verify(draft, rules);

        assertEquals(1, result.totalClaims());
        assertEquals(1, result.contradictedCount());
        assertEquals(0, result.verifiedCount());
        ClaimItemView claim = result.claims().get(0);
        assertEquals(ClaimStatus.CONTRADICTED, claim.status());
        assertEquals("fact-018", claim.sourceId());
        assertTrue(claim.confidence() >= 90);
        assertEquals("provides career guidance and placement assistance", claim.suggestedFix());
    }

    @Test
    void detectsVerifiedClaimsAlignedWithApprovedEvidence() {
        String draft = "BrightPath Institute provides career guidance and placement assistance to all admitted students.";
        ClaimVerificationView result = service.verify(draft, rules);

        assertEquals(1, result.totalClaims());
        assertEquals(1, result.verifiedCount());
        assertEquals(0, result.contradictedCount());
        ClaimItemView claim = result.claims().get(0);
        assertEquals(ClaimStatus.VERIFIED, claim.status());
        assertEquals("fact-018", claim.sourceId());
    }

    @Test
    void flagsUnverifiedFactualClaimsRequiringCitations() {
        String draft = "We enrolled 500 students last year with average salary of $95,000 across our global network.";
        ClaimVerificationView result = service.verify(draft, rules);

        assertEquals(1, result.totalClaims());
        assertEquals(1, result.unverifiedCount());
        ClaimItemView claim = result.claims().get(0);
        assertEquals(ClaimStatus.UNVERIFIED, claim.status());
        assertNull(claim.sourceId());
    }

    @Test
    void handlesEmptyContent() {
        ClaimVerificationView result = service.verify("", rules);
        assertEquals(0, result.totalClaims());
        assertEquals(100, result.truthScore());
    }
}

