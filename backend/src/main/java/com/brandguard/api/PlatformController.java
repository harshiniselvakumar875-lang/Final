package com.brandguard.api;

import com.brandguard.api.ApiModels.AuthRequest;
import com.brandguard.api.ApiModels.AuthResponse;
import com.brandguard.api.ApiModels.BrandView;
import com.brandguard.api.ApiModels.Caller;
import com.brandguard.api.ApiModels.ClaimVerificationView;
import com.brandguard.api.ApiModels.CommentRequest;
import com.brandguard.api.ApiModels.DecisionRequest;
import com.brandguard.api.ApiModels.ExtractedDocumentView;
import com.brandguard.api.ApiModels.FindingStateRequest;
import com.brandguard.api.ApiModels.HistoryView;
import com.brandguard.api.ApiModels.RegisterRequest;
import com.brandguard.api.ApiModels.RuleView;
import com.brandguard.api.ApiModels.RuleUpsertRequest;
import com.brandguard.api.ApiModels.SubmissionRequest;
import com.brandguard.api.ApiModels.RevisionRequest;
import com.brandguard.api.ApiModels.SubmissionView;
import com.brandguard.api.ApiModels.UserView;
import com.brandguard.service.PlatformService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PlatformController {
    private final PlatformService platform;

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody AuthRequest request) {
        return platform.login(request.email(), request.password());
    }

    @PostMapping("/auth/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return platform.register(request.email(), request.password());
    }

    @GetMapping("/auth/me")
    public UserView me(@AuthenticationPrincipal Caller caller) {
        return platform.profile(caller);
    }

    @GetMapping("/brands/current")
    public BrandView currentBrand(@AuthenticationPrincipal Caller caller) {
        return platform.currentBrand(caller);
    }

    @GetMapping("/brands/current/rules")
    public List<RuleView> currentRules(@AuthenticationPrincipal Caller caller) {
        return platform.currentRules(caller);
    }

    @PostMapping("/brands/current/rules")
    public List<RuleView> createRule(@AuthenticationPrincipal Caller caller, @Valid @RequestBody RuleUpsertRequest request) {
        return platform.createRule(caller, request);
    }

    @PutMapping("/brands/current/rules/{sourceId}")
    public List<RuleView> updateRule(@AuthenticationPrincipal Caller caller, @PathVariable String sourceId, @Valid @RequestBody RuleUpsertRequest request) {
        return platform.updateRule(caller, sourceId, request);
    }

    @DeleteMapping("/brands/current/rules/{sourceId}")
    public List<RuleView> archiveRule(@AuthenticationPrincipal Caller caller, @PathVariable String sourceId) {
        return platform.archiveRule(caller, sourceId);
    }

    @PostMapping("/submissions")
    public SubmissionView createSubmission(@AuthenticationPrincipal Caller caller, @Valid @RequestBody SubmissionRequest request) {
        return platform.createSubmission(caller, request);
    }

    @GetMapping("/submissions")
    public List<SubmissionView> listSubmissions(@AuthenticationPrincipal Caller caller) {
        return platform.listSubmissions(caller);
    }

    @GetMapping("/submissions/{id}")
    public SubmissionView getSubmission(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.getSubmission(caller, id);
    }

    @GetMapping("/submissions/{id}/history")
    public HistoryView history(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.history(caller, id);
    }

    @PostMapping("/submissions/{id}/comments")
    public HistoryView comment(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody CommentRequest request) {
        return platform.addComment(caller, id, request.text());
    }

    @PostMapping(value = "/documents/extract", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ExtractedDocumentView extractDocument(@AuthenticationPrincipal Caller caller, @RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF or DOCX file.");
        }
        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        return platform.extractDocument(caller, filename, file.getBytes());
    }

    @PostMapping("/submissions/{id}/analyze")
    public SubmissionView analyze(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.analyze(caller, id);
    }

    @PostMapping("/submissions/{id}/verify-claims")
    public ClaimVerificationView verifyClaims(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.verifyClaims(caller, id);
    }

    @PutMapping("/submissions/{id}/revision")
    public SubmissionView revise(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody RevisionRequest request) {
        return platform.revise(caller, id, request.content());
    }

    @PostMapping("/submissions/{id}/decisions")
    public SubmissionView decide(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody DecisionRequest request) {
        return platform.decide(caller, id, request.decision(), request.reason());
    }

    @PatchMapping("/findings/{id}")
    public SubmissionView updateFinding(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody FindingStateRequest request) {
        return platform.updateFinding(caller, id, request.state(), request.reason());
    }

    public record HealthResponse(String status) {}
}
