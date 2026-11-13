package com.brandguard.service;

import com.brandguard.api.ApiModels.ClaimItemView;
import com.brandguard.api.ApiModels.ClaimStatus;
import com.brandguard.api.ApiModels.ClaimVerificationView;
import com.brandguard.api.ApiModels.RuleView;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ClaimVerificationService {

    private static final Pattern SENTENCE_SPLIT = Pattern.compile("(?<=[.!?\\n])\\s+");
    private static final Pattern FACTUAL_INDICATORS = Pattern.compile(
            "\\b(\\d+([.,]\\d+)?%?|months?|years?|days?|hours?|weeks?|guarantee|guaranteed|placement|certified|accredited|#1|best|free|cost|price|fee|affordable|cheap|program|programme|salary|package|alumni|partner|partnership)\\b",
            Pattern.CASE_INSENSITIVE);

    public ClaimVerificationView verify(String content, List<RuleView> rules) {
        if (content == null || content.isBlank()) {
            return new ClaimVerificationView(0, 0, 0, 0, 100, List.of());
        }

        String[] rawSentences = SENTENCE_SPLIT.split(content.trim());
        List<ClaimItemView> claims = new ArrayList<>();

        for (String raw : rawSentences) {
            String sentence = raw.trim();
            if (sentence.length() < 6) continue;

            // Check if sentence matches any rule's matchText
            RuleView matchedRule = null;
            boolean isContradiction = false;
            boolean isPositiveMatch = false;

            for (RuleView rule : rules) {
                String matchLower = rule.matchText().toLowerCase(Locale.ROOT);
                String sentenceLower = sentence.toLowerCase(Locale.ROOT);

                if (sentenceLower.contains(matchLower)) {
                    matchedRule = rule;
                    if ("FACT_CONFLICT".equalsIgnoreCase(rule.kind())
                            || "RULE_VIOLATION".equalsIgnoreCase(rule.kind())
                            || "TERMINOLOGY".equalsIgnoreCase(rule.kind())) {
                        isContradiction = true;
                    }
                    break;
                }

                // Check positive match against approved evidence / suggestions
                if (!rule.suggestion().isBlank() && sentenceLower.contains(rule.suggestion().toLowerCase(Locale.ROOT))) {
                    matchedRule = rule;
                    isPositiveMatch = true;
                    break;
                }
            }

            if (isContradiction && matchedRule != null) {
                claims.add(new ClaimItemView(
                        UUID.randomUUID(),
                        sentence,
                        ClaimStatus.CONTRADICTED,
                        96,
                        matchedRule.sourceId(),
                        matchedRule.evidenceText(),
                        matchedRule.explanation(),
                        matchedRule.suggestion()
                ));
            } else if (isPositiveMatch && matchedRule != null) {
                claims.add(new ClaimItemView(
                        UUID.randomUUID(),
                        sentence,
                        ClaimStatus.VERIFIED,
                        95,
                        matchedRule.sourceId(),
                        matchedRule.evidenceText(),
                        "Verified against approved brand source: " + matchedRule.sourceId() + ".",
                        null
                ));
            } else {
                // Check if sentence makes other factual claims
                Matcher matcher = FACTUAL_INDICATORS.matcher(sentence);
                if (matcher.find()) {
                    // It asserts metrics or facts without corresponding approved evidence
                    claims.add(new ClaimItemView(
                        UUID.randomUUID(),
                        sentence,
                        ClaimStatus.UNVERIFIED,
                        75,
                        null,
                        null,
                        "Factual assertion detected without explicit verification in the approved brand library. Requires supporting citation.",
                        null
                    ));
                }
            }
        }

        int verifiedCount = (int) claims.stream().filter(c -> c.status() == ClaimStatus.VERIFIED).count();
        int contradictedCount = (int) claims.stream().filter(c -> c.status() == ClaimStatus.CONTRADICTED).count();
        int unverifiedCount = (int) claims.stream().filter(c -> c.status() == ClaimStatus.UNVERIFIED).count();
        int totalClaims = claims.size();

        int truthScore;
        if (totalClaims == 0) {
            truthScore = 100;
        } else {
            double rawScore = ((verifiedCount * 100.0) + (unverifiedCount * 45.0)) / totalClaims;
            rawScore -= (contradictedCount * 25.0);
            truthScore = (int) Math.max(0, Math.min(100, Math.round(rawScore)));
        }

        return new ClaimVerificationView(totalClaims, verifiedCount, contradictedCount, unverifiedCount, truthScore, claims);
    }
}

