import { useEffect, useMemo, useState } from 'react'
import Login from './Login'
import { api, clearToken, token, type Brand, type ClaimItem, type Finding, type Rule, type RuleInput, type Submission, type SubmissionHistory, type User } from './api'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  Upload,
  X,
} from 'lucide-react'

type View = 'Overview' | 'Submissions' | 'Review queue' | 'Brand library' | 'Analytics'
type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT'
type Theme = 'light' | 'dark'

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Submissions', icon: FileText },
  { label: 'Review queue', icon: ListChecks },
  { label: 'Brand library', icon: BookOpenCheck },
  { label: 'Analytics', icon: Activity },
]

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function statusLabel(status: string) {
  return ({
    SUBMITTED: 'Submitted',
    ANALYSING: 'Analysing',
    NEEDS_CHANGES: 'Changes requested',
    IN_REVIEW: 'In review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    FAILED: 'Analysis failed',
  } as Record<string, string>)[status] ?? status.replaceAll('_', ' ').toLowerCase()
}

function exportSubmissionsCSV(submissions: Submission[]) {
  const headers = ['Submission ID', 'Title', 'Creator', 'Status', 'Version', 'Guideline Version', 'Open Findings', 'Total Claims', 'Verified Claims', 'Contradicted Claims', 'Truth Score', 'Created At']
  const rows = submissions.map((sub) => {
    const openFindings = sub.findings.filter((f) => f.state === 'OPEN').length
    const cv = sub.claimVerification
    return [
      `"${sub.id}"`,
      `"${sub.title.replace(/"/g, '""')}"`,
      `"${sub.creatorEmail}"`,
      `"${sub.status}"`,
      sub.versionNo,
      `"${sub.guidelineVersion ?? ''}"`,
      openFindings,
      cv?.totalClaims ?? 0,
      cv?.verifiedCount ?? 0,
      cv?.contradictedCount ?? 0,
      cv ? `${cv.truthScore}%` : 'N/A',
      `"${sub.createdAt}"`
    ].join(',')
  })
  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `brandguard-compliance-report-${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function exportSubmissionsJSON(submissions: Submission[]) {
  const data = JSON.stringify(submissions, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `brandguard-compliance-audit-${new Date().toISOString().slice(0, 10)}.json`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('brandguard-theme') === 'dark' ? 'dark' : 'light')
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('brandguard-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((current) => current === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    if (!token()) {
      setAuthReady(true)
      return
    }

    api.me()
      .then(setUser)
      .catch((error: unknown) => setAuthError(errorMessage(error)))
      .finally(() => setAuthReady(true))
  }, [])

  if (!authReady) {
    return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form-heading"><h2>Loading workspace…</h2></div></div></div>
  }

  if (authError) {
    return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form-heading"><h2>Workspace unavailable</h2><p>{authError}</p><button className="button button-primary" onClick={() => { clearToken(); setAuthError('') }}>Return to sign in</button></div></div></div>
  }

  if (!user) return <Login onAuthenticated={setUser} theme={theme} onToggleTheme={toggleTheme} />
  return <DashboardApp user={user} theme={theme} onToggleTheme={toggleTheme} onSignOut={() => { clearToken(); setUser(null) }} />
}

function DashboardApp({ user, theme, onToggleTheme, onSignOut }: { user: User; theme: Theme; onToggleTheme: () => void; onSignOut: () => void }) {
  const [activeView, setActiveView] = useState<View>('Overview')
  const [brand, setBrand] = useState<Brand | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedFindingId, setSelectedFindingId] = useState('')
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const canCreate = user.role === 'CREATOR' || user.role === 'BRAND_ADMIN'
  const canReview = user.role === 'REVIEWER' || user.role === 'BRAND_ADMIN'
  const profileName = user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  const selectedSubmission = submissions.find((submission) => submission.id === selectedId)
  const reviewQueue = submissions.filter((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([api.brand(), api.rules(), api.submissions()])
      .then(([brandResult, ruleResults, submissionResults]) => {
        if (!active) return
        setBrand(brandResult)
        setRules(ruleResults)
        setSubmissions(submissionResults)
        const firstReview = submissionResults.find((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))
        const initial = firstReview ?? submissionResults[0]
        if (initial) {
          setSelectedId(initial.id)
          setSelectedFindingId('')
          setDraft(initial.content)
          setTitle(initial.title)
        }
      })
      .catch((issue: unknown) => {
        if (active) setError(errorMessage(issue))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [reloadKey])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }

  function updateSubmission(submission: Submission) {
    setSubmissions((current) => [submission, ...current.filter((item) => item.id !== submission.id)])
    setSelectedId(submission.id)
    setDraft(submission.content)
    setTitle(submission.title)
  }

  function selectSubmission(id: string) {
    const submission = submissions.find((item) => item.id === id)
    setSelectedId(id)
    setSelectedFindingId('')
    setDraft(submission?.content ?? '')
    setTitle(submission?.title ?? '')
    setReviewNote('')
  }

  function startNewSubmission() {
    setSelectedId('')
    setSelectedFindingId('')
    setDraft('')
    setTitle('')
    setActiveView('Submissions')
    setError('')
  }

  async function runAnalysis() {
    if (!draft.trim() || !title.trim()) {
      setError('Add a submission title and draft before checking the content.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let submission: Submission
      if (selectedSubmission?.status === 'NEEDS_CHANGES' && draft.trim() !== selectedSubmission.content && user.role === 'CREATOR') {
        submission = await api.revise(selectedSubmission.id, draft.trim())
      } else if (selectedSubmission && draft.trim() === selectedSubmission.content && !['APPROVED', 'REJECTED'].includes(selectedSubmission.status)) {
        submission = selectedSubmission
      } else {
        submission = await api.createSubmission(title.trim(), draft.trim())
      }
      submission = await api.analyze(submission.id)
      updateSubmission(submission)
      notify(submission.findings.length
        ? `${submission.findings.length} finding${submission.findings.length === 1 ? '' : 's'} linked to approved sources`
        : 'No rule matches found. Human review is still required.')
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function updateFinding(finding: Finding, state: 'ACCEPTED' | 'DISMISSED') {
    setBusy(true)
    setError('')
    try {
      const updated = await api.updateFinding(finding.id, state, state === 'ACCEPTED' ? 'Suggestion applied' : 'Dismissed by user')
      updateSubmission(updated)
      if (state === 'ACCEPTED') {
        const escaped = finding.excerpt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        setDraft((current) => current.replace(new RegExp(escaped, 'i'), finding.suggestedText))
        notify('Suggestion applied. Re-check the revised draft to submit a new version.')
      } else {
        notify('Finding dismissed and saved.')
      }
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function decide(decision: ReviewDecision) {
    if (!selectedSubmission) return
    if (!reviewNote.trim()) {
      setError('Add a reviewer note before recording a decision.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await api.decide(selectedSubmission.id, decision, reviewNote.trim())
      updateSubmission(updated)
      setReviewNote('')
      notify(`Decision recorded: ${statusLabel(updated.status)}.`)
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  async function saveBrandRule(rule: RuleInput, sourceId?: string) {
    setBusy(true)
    setError('')
    try {
      const updatedRules = sourceId ? await api.updateRule(sourceId, rule) : await api.createRule(rule)
      const updatedBrand = await api.brand()
      setRules(updatedRules)
      setBrand(updatedBrand)
      notify(sourceId ? 'Brand source updated and guideline version published.' : 'Brand source added and guideline version published.')
    } catch (issue) {
      setError(errorMessage(issue))
      throw issue
    } finally {
      setBusy(false)
    }
  }

  async function archiveBrandRule(sourceId: string) {
    setBusy(true)
    setError('')
    try {
      const updatedRules = await api.archiveRule(sourceId)
      const updatedBrand = await api.brand()
      setRules(updatedRules)
      setBrand(updatedBrand)
      notify('Brand source archived and guideline version published.')
    } catch (issue) {
      setError(errorMessage(issue))
      throw issue
    } finally {
      setBusy(false)
    }
  }

  async function loadTextFile(file?: File) {
    if (!file) return
    const name = file.name.toLowerCase()
    const isText = name.endsWith('.txt')
    const isDocument = name.endsWith('.pdf') || name.endsWith('.docx')
    if (!isText && !isDocument) {
      setError('Upload a .txt, .pdf, or .docx file.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const text = isText ? (await file.text()).trim() : (await api.extractDocument(file)).text.trim()
      if (!text) {
        setError('No text was found in that file.')
        return
      }
      setDraft(text)
      setTitle((current) => current || file.name.replace(/\.(txt|pdf|docx)$/i, ''))
      setSelectedId('')
      setSelectedFindingId('')
      notify(`${file.name} loaded into the draft. Check content to run brand compliance.`)
    } catch (issue) {
      setError(errorMessage(issue))
    } finally {
      setBusy(false)
    }
  }

  const allFindings = submissions.flatMap((submission) => submission.findings)
  const openCount = allFindings.filter((finding) => finding.state === 'OPEN').length
  const filteredSubmissions = submissions.filter((submission) =>
    `${submission.title} ${submission.creatorEmail} ${submission.status} ${submission.content}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div><div><div className="brand-name">brandguard<span>ai</span></div><div className="brand-caption">CONTENT ASSURANCE</div></div></div>
        <button className="workspace-switcher" onClick={() => setActiveView('Brand library')}><span className="workspace-avatar">{brand?.name.charAt(0) ?? 'B'}</span><span className="workspace-copy"><strong>{brand?.name ?? 'Brand workspace'}</strong><small>Brand workspace</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeView === label ? 'active' : ''}`} onClick={() => setActiveView(label)}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Review queue' && reviewQueue.length > 0 && <span className="nav-count">{reviewQueue.length}</span>}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><LockKeyhole size={15} /></div><div><strong>Human-led review</strong><p>AI findings never auto-approve content.</p></div></div>
          <div className="profile-row"><div className="profile-avatar">{profileName.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><strong>{profileName}</strong><small>{user.role.replaceAll('_', ' ')}</small></div><button className="icon-button small-icon" aria-label="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>{brand?.name ?? 'Brand workspace'}</span><ChevronRight size={14} /><strong>{activeView}</strong></div>
          <div className="topbar-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace" aria-label="Search workspace" /></label><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={onToggleTheme}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up')}><Bell size={17} /></button><div className="topbar-avatar">{profileName.slice(0, 2).toUpperCase()}</div></div>
        </header>
        <div className="page-content">
          {error && <div className="workspace-alert" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(''); setReloadKey((value) => value + 1) }}>Retry</button></div>}
          {loading ? <div className="panel empty-state"><strong>Loading your workspace…</strong></div> : <>
            {activeView === 'Overview' && <Overview
              brand={brand} rules={rules} submissions={filteredSubmissions} openCount={openCount} profileName={profileName} setActiveView={setActiveView}
              startNewSubmission={startNewSubmission} canCreate={canCreate} selectSubmission={selectSubmission}
            />}
            {activeView === 'Submissions' && <Submissions
              brand={brand} submissions={filteredSubmissions} selectedSubmission={selectedSubmission} selectedId={selectedId}
              draft={draft} setDraft={setDraft} title={title} setTitle={setTitle} rules={rules}
              canCreate={canCreate} busy={busy} selectSubmission={selectSubmission} runAnalysis={runAnalysis}
              updateSubmission={updateSubmission} updateFinding={updateFinding} loadTextFile={loadTextFile} startNewSubmission={startNewSubmission}
              selectedFindingId={selectedFindingId} setSelectedFindingId={setSelectedFindingId} notify={notify}
            />}
            {activeView === 'Review queue' && <ReviewQueue
              submissions={reviewQueue.filter((submission) => filteredSubmissions.some((item) => item.id === submission.id))} selectedSubmission={selectedSubmission} canReview={canReview}
              selectSubmission={selectSubmission} reviewNote={reviewNote} setReviewNote={setReviewNote}
              decide={decide} busy={busy}
            />}
            {activeView === 'Brand library' && <BrandLibrary brand={brand} rules={rules} search={search}
              canManage={user.role === 'BRAND_ADMIN'} busy={busy} saveRule={saveBrandRule} archiveRule={archiveBrandRule} />}
            {activeView === 'Analytics' && <Analytics submissions={submissions} />}
          </>}
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Overview({ brand, rules, submissions, openCount, profileName, setActiveView, startNewSubmission, canCreate, selectSubmission }: {
  brand: Brand | null; rules: Rule[]; submissions: Submission[]; openCount: number; profileName: string; setActiveView: (view: View) => void
  startNewSubmission: () => void; canCreate: boolean; selectSubmission: (id: string) => void
}) {
  const pending = submissions.filter((submission) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(submission.status))
  const analyzed = submissions.filter((submission) => submission.findings.length > 0)
  const linked = analyzed.flatMap((submission) => submission.findings).filter((finding) => finding.evidence).length
  const totalFindings = analyzed.flatMap((submission) => submission.findings).length
  const coverage = totalFindings ? Math.round((linked / totalFindings) * 100) : 0
  return <>
    <PageHeading eyebrow={brand?.name.toUpperCase() ?? 'BRAND WORKSPACE'} title={`Good morning, ${profileName}`} description="Here’s the latest activity across your brand workspace."
      action={canCreate && <button className="button button-primary" onClick={startNewSubmission}><Plus size={16} /> New submission</button>} />
    <section className="overview-hero" aria-label="Workspace quick actions">
      <div className="overview-hero-copy">
        <span className="overview-hero-kicker"><ShieldCheck size={14} /> YOUR BRAND WORKSPACE</span>
        <h2>Clear guidance.<br /><span>Confident content.</span></h2>
        <p>Keep every draft grounded in your approved brand sources, with a human in control of every decision.</p>
        <div className="overview-hero-meta"><span><CheckCircle2 size={14} /> Guideline {brand?.guidelineVersion ?? 'ready'}</span><span><span className="overview-live-dot" /> Workspace active</span></div>
      </div>
      <div className="overview-quick-actions">
        <div className="overview-quick-heading"><span>QUICK ACTIONS</span><small>Pick up where you left off</small></div>
        <button className="overview-action-card primary-action" onClick={canCreate ? startNewSubmission : () => setActiveView('Submissions')}>
          <span className="overview-action-icon"><Plus size={17} /></span><span><strong>{canCreate ? 'Check new content' : 'Browse submissions'}</strong><small>{canCreate ? 'Start a brand review' : 'Explore your workspace'}</small></span><ArrowRight size={16} />
        </button>
        <button className="overview-action-card" onClick={() => setActiveView('Review queue')}>
          <span className="overview-action-icon review-action-icon"><ListChecks size={17} /></span><span><strong>Review queue</strong><small>{pending.length ? `${pending.length} waiting for a decision` : 'No items awaiting review'}</small></span><ArrowRight size={16} />
        </button>
        <button className="overview-action-card" onClick={() => setActiveView('Brand library')}>
          <span className="overview-action-icon library-action-icon"><BookOpenCheck size={17} /></span><span><strong>Brand library</strong><small>{rules.length} approved {rules.length === 1 ? 'source' : 'sources'}</small></span><ArrowRight size={16} />
        </button>
      </div>
    </section>
    <section className="metrics-grid" aria-label="Workspace metrics">
      <Metric icon={FileText} label="Submissions" value={String(submissions.length)} trendNote="all time" accent="mint" />
      <Metric icon={CircleAlert} label="Open findings" value={String(openCount)} trendNote="across submissions" accent="coral" />
      <Metric icon={Clock3} label="Awaiting review" value={String(pending.filter((item) => item.status === 'IN_REVIEW').length)} trendNote="in the review queue" accent="blue" />
      <Metric icon={BadgeCheck} label="Evidence coverage" value={`${coverage}%`} trendNote={totalFindings ? `${linked} of ${totalFindings} findings linked` : 'from analyzed submissions'} accent="gold" />
    </section>
    <section className="section-head"><div><div className="eyebrow">RECENT SUBMISSIONS</div><h2>Your workspace activity</h2></div><button className="text-button" onClick={() => setActiveView('Submissions')}>View submissions <ArrowRight size={15} /></button></section>
    <section className="panel source-list">
      {submissions.slice(0, 5).map((submission) =>
        <button className="submission-list-row" key={submission.id} onClick={() => { selectSubmission(submission.id); setActiveView('Submissions') }}>
          <span className="file-icon"><FileText size={17} /></span><span className="submission-list-copy"><strong>{submission.title}</strong><small>{submission.creatorEmail} · Version {submission.versionNo}</small></span>
          <span className={`submission-status ${submission.status.toLowerCase()}`}>{statusLabel(submission.status)}</span><ChevronRight size={16} />
        </button>
      )}
      {!submissions.length && <div className="empty-state"><FileText size={22} /><strong>No submissions yet</strong><span>Start with a content draft to run your first check.</span></div>}
    </section>
    {pending.length > 0 && <div className="overview-queue-link"><button className="button button-secondary" onClick={() => setActiveView('Review queue')}><ListChecks size={15} /> Open review queue ({pending.length})</button></div>}
  </>
}

function Metric({ icon: Icon, label, value, trendNote, accent }: { icon: typeof FileText; label: string; value: string; trendNote: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={17} /></div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong></div><div className="metric-note">{trendNote}</div></article>
}

function FindingRow({ finding, selected, onSelect }: { finding: Finding; selected: boolean; onSelect: () => void }) {
  return <button className={`finding-row ${selected ? 'selected' : ''} ${finding.state !== 'OPEN' ? 'resolved' : ''}`} onClick={onSelect}>
    <span className={`severity-mark ${finding.severity.toLowerCase()}`} /><span className="finding-copy"><strong>{finding.category}</strong><small>{finding.excerpt}</small></span>
    <span className={`severity-label ${finding.severity.toLowerCase()}`}>{finding.state === 'OPEN' ? finding.severity : finding.state}</span>
  </button>
}

function Submissions({ brand, submissions, selectedSubmission, selectedId, draft, setDraft, title, setTitle, rules, canCreate, busy, selectSubmission, runAnalysis, updateSubmission, updateFinding, loadTextFile, startNewSubmission, selectedFindingId, setSelectedFindingId, notify }: {
  brand: Brand | null; submissions: Submission[]; selectedSubmission?: Submission; selectedId: string; draft: string; setDraft: React.Dispatch<React.SetStateAction<string>>
  title: string; setTitle: (value: string) => void; rules: Rule[]; canCreate: boolean; busy: boolean
  selectSubmission: (id: string) => void; runAnalysis: () => void; updateSubmission: (submission: Submission) => void
  updateFinding: (finding: Finding, state: 'ACCEPTED' | 'DISMISSED') => void
  loadTextFile: (file?: File) => void; startNewSubmission: () => void
  selectedFindingId: string; setSelectedFindingId: (id: string) => void
  notify: (msg: string) => void
}) {
  const [resultsTab, setResultsTab] = useState<'findings' | 'claims'>('findings')
  const [claimFilter, setClaimFilter] = useState<'ALL' | 'CONTRADICTED' | 'UNVERIFIED' | 'VERIFIED'>('ALL')
  const [verifying, setVerifying] = useState(false)

  const findings = selectedSubmission?.findings ?? []
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) ?? findings.find((finding) => finding.state === 'OPEN')
  const openFindings = findings.filter((finding) => finding.state === 'OPEN')
  const readOnly = !canCreate || ['APPROVED', 'REJECTED'].includes(selectedSubmission?.status ?? '')

  const claimVerification = selectedSubmission?.claimVerification
  const claims = claimVerification?.claims ?? []
  const filteredClaims = claims.filter((claim) => claimFilter === 'ALL' || claim.status === claimFilter)

  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0
  const chars = draft.length
  const readTime = Math.max(1, Math.ceil(words / 200))

  async function handleVerifyClaims() {
    if (!selectedSubmission) return
    setVerifying(true)
    try {
      const res = await api.verifyClaims(selectedSubmission.id)
      updateSubmission({ ...selectedSubmission, claimVerification: res })
      notify(`Verified ${res.totalClaims} claims (Truth Score: ${res.truthScore}%)`)
      setResultsTab('claims')
    } catch (e) {
      notify('Failed to verify claims: ' + errorMessage(e))
    } finally {
      setVerifying(false)
    }
  }

  function applyClaimFix(claim: ClaimItem) {
    if (!claim.suggestedFix) return
    const escaped = claim.claimText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    setDraft((curr: string) => curr.replace(new RegExp(escaped, 'i'), claim.suggestedFix!))
    notify('Applied verified correction to draft.')
  }

  return <>
    <PageHeading eyebrow="CONTENT WORKSPACE" title="Submissions" description={`Create, check, and track content against ${brand?.name ?? 'your brand'}’s approved sources.`}
      action={<div className="heading-actions">
        {selectedSubmission && (
          <div className="editor-export-actions">
            <button className="button button-secondary compact" title="Export this submission as CSV" onClick={() => exportSubmissionsCSV([selectedSubmission])}>
              <FileSpreadsheet size={14} /> Export CSV
            </button>
            <button className="button button-secondary compact" title="Export this submission as JSON" onClick={() => exportSubmissionsJSON([selectedSubmission])}>
              <Download size={14} /> Export JSON
            </button>
          </div>
        )}
        {canCreate && <button className="button button-secondary" onClick={startNewSubmission}><Plus size={15} /> New draft</button>}
        {canCreate && <label className="button button-secondary upload-button"><Upload size={15} /> Upload file<input type="file" accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { loadTextFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>}
      </div>} />
    <div className="submission-toolbar">
      <label className="submission-picker"><span>SUBMISSION</span><select value={selectedId} onChange={(event) => selectSubmission(event.target.value)}><option value="">New draft</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title} · v{submission.versionNo}</option>)}</select></label>
      <div className="field-select"><span>BRAND</span><strong>{brand?.name ?? 'Loading…'}</strong><ChevronDown size={14} /></div>
      {selectedSubmission && <div className="submission-id">Version {selectedSubmission.versionNo} · {statusLabel(selectedSubmission.status)}</div>}
    </div>
    <div className="submission-grid">
      <section className="panel editor-panel"><div className="panel-heading"><div><h3>Content draft</h3><p>Text is treated as content, never as instructions to the AI.</p></div><span className="draft-label"><span className={`status-dot ${selectedSubmission?.status === 'APPROVED' ? 'green' : 'amber'}`} />{selectedSubmission ? statusLabel(selectedSubmission.status).toUpperCase() : 'DRAFT'}</span></div>
        {canCreate && <label className="submission-title-field">Submission title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="e.g. Spring campaign social post" disabled={readOnly} /></label>}
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste your content here..." aria-label="Content draft" readOnly={readOnly} />
        <div className="editor-bottom">
          <div className="editor-stats-bar">
            <div className="editor-stat-items">
              <span><strong>{words}</strong> words</span>
              <span>·</span>
              <span><strong>{chars}</strong> chars</span>
              <span>·</span>
              <span>~{readTime} min read</span>
              <span>·</span>
              <span>{selectedSubmission ? `v${selectedSubmission.versionNo}` : 'Draft'}</span>
            </div>
          </div>
          {canCreate && !readOnly && <button className="button button-primary" onClick={runAnalysis} disabled={busy || !draft.trim()}><Sparkles size={16} />{busy ? 'Checking…' : 'Check content'}</button>}
        </div>
        <div className="privacy-note"><LockKeyhole size={14} /><span>Content checks use the active approved brand rules. A reviewer makes the final decision.</span></div>
      </section>

      <section className="panel results-panel">
        <div className="panel-tab-group">
          <button className={`panel-tab-btn ${resultsTab === 'findings' ? 'active' : ''}`} onClick={() => setResultsTab('findings')}>
            <CircleAlert size={14} /> Brand Rules {openFindings.length > 0 && <span className="panel-tab-badge coral">{openFindings.length}</span>}
          </button>
          <button className={`panel-tab-btn ${resultsTab === 'claims' ? 'active' : ''}`} onClick={() => setResultsTab('claims')}>
            <Scale size={14} /> Claim Verification {claimVerification && <span className={`panel-tab-badge ${claimVerification.contradictedCount > 0 ? 'coral' : claimVerification.unverifiedCount > 0 ? 'amber' : ''}`}>{claimVerification.truthScore}%</span>}
          </button>
        </div>

        {resultsTab === 'findings' && (
          <>
            <div className="panel-heading"><div><div className="eyebrow">ANALYSIS REPORT</div><h3>{selectedSubmission ? `${openFindings.length} open findings` : 'No analysis yet'}</h3></div><span className="version-tag">{selectedSubmission?.guidelineVersion ?? brand?.guidelineVersion ?? '—'}</span></div>
            <div className="result-summary"><div><strong>{openFindings.filter((finding) => finding.severity === 'HIGH').length}</strong><span>High</span></div><div><strong>{openFindings.filter((finding) => finding.severity === 'MEDIUM').length}</strong><span>Medium</span></div><div><strong>{openFindings.filter((finding) => finding.severity === 'LOW').length}</strong><span>Low</span></div><div className="evidence-coverage"><strong>{findings.length ? `${Math.round((findings.filter((finding) => finding.evidence).length / findings.length) * 100)}%` : '—'}</strong><span>Evidence</span></div></div>
            <div className="result-list">{findings.map((finding) => <FindingRow key={finding.id} finding={finding} selected={selectedFinding?.id === finding.id} onSelect={() => setSelectedFindingId(finding.id)} />)}{!findings.length && <div className="empty-state"><ShieldCheck size={22} /><strong>{selectedSubmission ? 'No findings returned' : 'Ready to check'}</strong><span>{selectedSubmission ? 'No active rules matched this content.' : `${rules.length} approved rules are ready to check your draft.`}</span></div>}</div>
            {selectedFinding && <div className="evidence-box"><div className="evidence-label"><CircleAlert size={14} /> WHY THIS WAS FLAGGED</div><p>{selectedFinding.explanation}</p></div>}
            {selectedFinding?.evidence && <div className="evidence-box"><div className="evidence-label"><ShieldCheck size={14} /> APPROVED SOURCE <span>{selectedFinding.evidence.sourceId}</span></div><p>{selectedFinding.evidence.evidenceText}</p></div>}
            {selectedFinding && <div className="suggestion-card"><div className="suggestion-label"><Sparkles size={14} /> SUGGESTED CORRECTION</div><p>{selectedFinding.suggestedText}</p>{selectedFinding.state === 'OPEN' && canCreate && <div className="suggestion-actions"><button className="button button-primary compact" onClick={() => updateFinding(selectedFinding, 'ACCEPTED')} disabled={busy}><Check size={14} /> Apply suggestion</button><button className="button button-quiet compact" onClick={() => updateFinding(selectedFinding, 'DISMISSED')} disabled={busy}><X size={14} /> Dismiss</button></div>}</div>}
            {selectedSubmission?.decisions[0] && <div className="manual-review-note"><MessageSquareText size={14} /><span>Latest reviewer note: {selectedSubmission.decisions[0].reason}</span></div>}
            {findings.length > 0 && !selectedSubmission?.decisions[0] && <div className="manual-review-note"><LockKeyhole size={14} /><span>Suggestions do not approve content. A reviewer makes the final decision.</span></div>}
          </>
        )}

        {resultsTab === 'claims' && (
          <>
            {claimVerification ? (
              <>
                <div className="truth-scorecard">
                  <div className="truth-score-main">
                    <div className={`truth-score-circle ${claimVerification.truthScore >= 80 ? 'high' : claimVerification.truthScore >= 50 ? 'medium' : 'low'}`}>
                      {claimVerification.truthScore}%
                    </div>
                    <div className="truth-score-info">
                      <strong>Claim Truthfulness</strong>
                      <small>{claimVerification.totalClaims} extracted claims verified</small>
                    </div>
                  </div>
                  <div className="truth-score-stats">
                    <div className="truth-stat-pill verified">
                      <strong>{claimVerification.verifiedCount}</strong>
                      <span>Verified</span>
                    </div>
                    <div className="truth-stat-pill contradicted">
                      <strong>{claimVerification.contradictedCount}</strong>
                      <span>Conflicts</span>
                    </div>
                    <div className="truth-stat-pill unverified">
                      <strong>{claimVerification.unverifiedCount}</strong>
                      <span>Unverified</span>
                    </div>
                  </div>
                </div>

                <div className="claim-filter-bar">
                  <button className={`claim-filter-pill ${claimFilter === 'ALL' ? 'active' : ''}`} onClick={() => setClaimFilter('ALL')}>
                    All ({claimVerification.totalClaims})
                  </button>
                  <button className={`claim-filter-pill ${claimFilter === 'CONTRADICTED' ? 'active' : ''}`} onClick={() => setClaimFilter('CONTRADICTED')}>
                    Contradicted ({claimVerification.contradictedCount})
                  </button>
                  <button className={`claim-filter-pill ${claimFilter === 'UNVERIFIED' ? 'active' : ''}`} onClick={() => setClaimFilter('UNVERIFIED')}>
                    Unverified ({claimVerification.unverifiedCount})
                  </button>
                  <button className={`claim-filter-pill ${claimFilter === 'VERIFIED' ? 'active' : ''}`} onClick={() => setClaimFilter('VERIFIED')}>
                    Verified ({claimVerification.verifiedCount})
                  </button>
                </div>

                <div className="claim-list">
                  {filteredClaims.map((claim) => (
                    <article key={claim.id} className={`claim-card ${claim.status.toLowerCase()}`}>
                      <div className="claim-card-top">
                        <span className={`claim-badge ${claim.status.toLowerCase()}`}>
                          {claim.status === 'VERIFIED' && <CheckCircle2 size={13} />}
                          {claim.status === 'CONTRADICTED' && <AlertTriangle size={13} />}
                          {claim.status === 'UNVERIFIED' && <HelpCircle size={13} />}
                          {claim.status}
                        </span>
                        <span className="claim-confidence">{claim.confidence}% confidence</span>
                      </div>
                      <blockquote className="claim-text-quote">"{claim.claimText}"</blockquote>
                      <p className="claim-explanation">{claim.explanation}</p>
                      {claim.sourceId && (
                        <div className="claim-evidence-box">
                          <div className="claim-evidence-source">
                            <ShieldCheck size={13} /> Trusted Evidence · {claim.sourceId}
                          </div>
                          <p className="claim-evidence-text">"{claim.evidenceText}"</p>
                        </div>
                      )}
                      {claim.suggestedFix && canCreate && !readOnly && (
                        <div className="claim-suggestion-box">
                          <div className="claim-suggestion-header">
                            <Sparkles size={13} /> Verified Correction
                          </div>
                          <p className="claim-suggestion-text">{claim.suggestedFix}</p>
                          <button className="button button-primary compact claim-apply-btn" onClick={() => applyClaimFix(claim)}>
                            <Check size={13} /> Apply to draft
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {!filteredClaims.length && (
                    <div className="empty-state">
                      <span>No claims matching the "{claimFilter.toLowerCase()}" filter.</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Scale size={24} />
                <strong>No claim verification recorded</strong>
                <span>Factual claims are automatically extracted and verified against approved brand evidence during content check.</span>
                {selectedSubmission && (
                  <button className="button button-primary compact" style={{ marginTop: 12 }} onClick={handleVerifyClaims} disabled={verifying}>
                    <Sparkles size={14} /> {verifying ? 'Verifying claims…' : 'Verify Claims Now'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
    {selectedSubmission && <HistoryPanel submissionId={selectedSubmission.id} versionNo={selectedSubmission.versionNo} status={selectedSubmission.status} decisionCount={selectedSubmission.decisions.length} canComment={false} />}
  </>
}

function ReviewQueue({ submissions, selectedSubmission, canReview, selectSubmission, reviewNote, setReviewNote, decide, busy }: {
  submissions: Submission[]; selectedSubmission?: Submission; canReview: boolean; selectSubmission: (id: string) => void
  reviewNote: string; setReviewNote: (value: string) => void; decide: (decision: ReviewDecision) => void; busy: boolean
}) {
  const selected = submissions.find((item) => item.id === selectedSubmission?.id) ?? submissions[0]
  return <>
    <PageHeading eyebrow="HUMAN REVIEW" title="Review queue" description="Review submitted content and record a reasoned decision." action={<div className="queue-filter"><span className="filter-dot" /> {submissions.length} awaiting review</div>} />
    <div className="review-layout"><section className="panel review-list-panel"><div className="review-list-heading"><div><strong>Needs your attention</strong><small>Prioritised by severity</small></div><span className="table-label">{submissions.length} ITEMS</span></div>
      {submissions.map((submission) => {
        const topSeverity = submission.findings.find((finding) => finding.state === 'OPEN')?.severity ?? 'LOW'
        return <button className={`review-item ${selected?.id === submission.id ? 'active-review' : ''}`} key={submission.id} onClick={() => selectSubmission(submission.id)}>
          <span className={`queue-priority ${topSeverity.toLowerCase()}-priority`}>{topSeverity[0]}</span><span className="review-item-main"><strong>{submission.title}</strong><small>{submission.creatorEmail} · Version {submission.versionNo}</small><span className="review-tags"><span className={`submission-status ${submission.status.toLowerCase()}`}>{statusLabel(submission.status)}</span><span className="review-requested">{submission.findings.filter((finding) => finding.state === 'OPEN').length} open findings</span></span></span><ChevronRight size={16} />
        </button>
      })}
      {!submissions.length && <div className="empty-state"><ListChecks size={22} /><strong>Queue is clear</strong><span>New submissions will appear here after analysis.</span></div>}
    </section>
    {selected && <section className="panel decision-panel"><div className="review-content-head"><div><div className="eyebrow">VERSION {selected.versionNo} · {selected.guidelineVersion ?? 'GUIDELINE'}</div><h3>{selected.title}</h3><p>{selected.creatorEmail}</p></div><span className={`submission-status ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span></div>
      <div className="review-content-text">{selected.content}</div>
      <div className="review-findings">{selected.findings.map((finding) => <article className="review-evidence" key={finding.id}><div className={`evidence-label ${finding.severity.toLowerCase()}`}><CircleAlert size={14} /> {finding.severity} · {finding.category}<span>{finding.evidence?.sourceId ?? 'NO SOURCE'}</span></div><p><strong>{finding.excerpt}</strong> — {finding.explanation}</p>{finding.evidence && <p className="review-evidence-source">Approved source: {finding.evidence.evidenceText}</p>}</article>)}{!selected.findings.length && <div className="review-evidence"><p>No findings were returned for this submission. Review the content before approving.</p></div>}</div>
      {canReview && <><div className="decision-controls"><label htmlFor="decision-reason">REVIEWER NOTE <span>Required for every decision</span></label><textarea id="decision-reason" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Add context for your decision..." /></div>
        <div className="decision-actions"><button className="button button-quiet" onClick={() => decide('REQUEST_CHANGES')} disabled={busy}><MessageSquareText size={15} /> Request changes</button><button className="button button-quiet" onClick={() => decide('REJECT')} disabled={busy}>Reject</button><button className="button button-approve" onClick={() => decide('APPROVE')} disabled={busy}><Check size={15} /> Approve</button></div></>}
      {!canReview && <div className="manual-review-note"><LockKeyhole size={14} /><span>Your role can view submissions but cannot record review decisions.</span></div>}
      {selected.decisions[0] && <div className="review-decision-state"><span className="status-dot green" /> Last decision: <strong>{selected.decisions[0].decision.replaceAll('_', ' ')}</strong> · {selected.decisions[0].reviewerEmail}</div>}
    </section>}
    {!selected && <section className="panel decision-panel empty-state"><strong>Select a submission to review</strong></section>}</div>
    {selected && <HistoryPanel submissionId={selected.id} versionNo={selected.versionNo} status={selected.status} decisionCount={selected.decisions.length} canComment={canReview && ['IN_REVIEW', 'NEEDS_CHANGES'].includes(selected.status)} />}
  </>
}

function auditLabel(action: string) {
  return ({
    CONTENT_SUBMITTED: 'Submitted',
    ANALYSIS_COMPLETED: 'Analysis completed',
    CONTENT_REVISED: 'Revision saved',
    REVIEW_DECISION: 'Review decision',
    REVIEW_COMMENT: 'Reviewer comment',
    FINDING_ACCEPTED: 'Suggestion applied',
    FINDING_DISMISSED: 'Finding dismissed',
  } as Record<string, string>)[action] ?? action.replaceAll('_', ' ').toLowerCase()
}

function formatWhen(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function HistoryPanel({ submissionId, versionNo, status, decisionCount, canComment }: {
  submissionId: string
  versionNo: number
  status: string
  decisionCount: number
  canComment: boolean
}) {
  const [history, setHistory] = useState<SubmissionHistory | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    let active = true
    setHistoryError('')
    api.history(submissionId)
      .then((result) => { if (active) setHistory(result) })
      .catch((issue: unknown) => { if (active) setHistoryError(errorMessage(issue)) })
    return () => { active = false }
  }, [submissionId, versionNo, status, decisionCount])

  async function submitComment(event: React.FormEvent) {
    event.preventDefault()
    if (!comment.trim()) return
    setSaving(true)
    setHistoryError('')
    try {
      setHistory(await api.comment(submissionId, comment.trim()))
      setComment('')
    } catch (issue) {
      setHistoryError(errorMessage(issue))
    } finally {
      setSaving(false)
    }
  }

  return <section className="history-layout" aria-label="Revision history and audit log">
    <article className="panel">
      <div className="panel-heading"><div><div className="eyebrow">REVISION HISTORY</div><h3>{history ? `${history.versions.length} saved versions` : 'Loading versions…'}</h3></div></div>
      <div className="history-list">
        {history?.versions.map((version) => <article className="history-item" key={version.versionNo}><strong>Version {version.versionNo}</strong><small>{version.changedByEmail} · {formatWhen(version.createdAt)}</small><p>{version.content}</p></article>)}
        {history && !history.versions.length && <div className="empty-state"><span>No saved versions yet.</span></div>}
      </div>
    </article>
    <article className="panel">
      <div className="panel-heading"><div><div className="eyebrow">AUDIT LOG</div><h3>Recorded activity</h3></div></div>
      <div className="history-list">
        {history?.events.map((event, index) => <article className="history-item" key={`${event.action}-${event.createdAt}-${index}`}><strong>{auditLabel(event.action)}</strong><small>{event.actorEmail ?? 'System'} · {formatWhen(event.createdAt)}</small>{event.details && <p>{event.details}</p>}</article>)}
        {history && !history.events.length && <div className="empty-state"><span>No audit events for this submission yet.</span></div>}
      </div>
      {canComment && <form className="comment-form" onSubmit={submitComment}>
        <label htmlFor={`review-comment-${submissionId}`}>REVIEWER COMMENT <span>Saved to the audit log</span></label>
        <textarea id={`review-comment-${submissionId}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a comment without changing the decision..." />
        <button className="button button-secondary compact" disabled={saving || !comment.trim()}>{saving ? 'Saving…' : 'Save comment'}</button>
      </form>}
      {historyError && <div className="workspace-alert" role="alert">{historyError}</div>}
    </article>
  </section>
}

function BrandLibrary({ brand, rules, search, canManage, busy, saveRule, archiveRule }: {
  brand: Brand | null; rules: Rule[]; search: string; canManage: boolean; busy: boolean
  saveRule: (rule: RuleInput, sourceId?: string) => Promise<void>; archiveRule: (sourceId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<RuleInput | null>(null)
  const [formError, setFormError] = useState('')
  const entries = rules.filter((rule) => `${rule.sourceId} ${rule.category} ${rule.matchText} ${rule.evidenceText}`.toLowerCase().includes(search.toLowerCase()))

  async function submitRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setFormError('')
    try {
      await saveRule(editing, rules.some((rule) => rule.sourceId === editing.sourceId) ? editing.sourceId : undefined)
      setEditing(null)
    } catch (issue) {
      setFormError(errorMessage(issue))
    }
  }

  return <>
    <PageHeading eyebrow="APPROVED KNOWLEDGE" title="Brand library" description="The active, versioned sources grounding each content check."
      action={canManage && <button className="button button-primary" onClick={() => { setFormError(''); setEditing({ sourceId: '', kind: 'FACT_CONFLICT', category: '', severity: 'MEDIUM', matchText: '', explanation: '', evidenceText: '', suggestion: '' }) }}><Plus size={15} /> Add source</button>} />
    <div className="library-summary"><div className="library-version"><span className="version-badge"><BookOpenCheck size={17} /></span><div><strong>{brand?.name ?? 'Brand'} · Guideline {brand?.guidelineVersion ?? '—'}</strong><small>{rules.length} active approved rules</small></div><span className="active-pill"><i /> ACTIVE</span></div></div>
    <div className="library-filters"><span className="filter-tab selected">All sources <span>{entries.length}</span></span></div>
    {editing && <form className="panel rule-editor" onSubmit={submitRule}>
      <div className="panel-heading"><div><h3>{rules.some((rule) => rule.sourceId === editing.sourceId) ? 'Edit approved source' : 'Add approved source'}</h3><p>Publishing changes advances the active guideline version.</p></div><button type="button" className="icon-button" aria-label="Close editor" onClick={() => setEditing(null)}><X size={17} /></button></div>
      <div className="rule-editor-grid">
        <label>Source ID<input required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}" maxLength={60} value={editing.sourceId} disabled={rules.some((rule) => rule.sourceId === editing.sourceId)} onChange={(event) => setEditing({ ...editing, sourceId: event.target.value })} /></label>
        <label>Kind<select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}><option value="FACT_CONFLICT">Fact conflict</option><option value="TERMINOLOGY">Terminology</option><option value="RULE_VIOLATION">Rule violation</option><option value="STYLE">Style</option></select></label>
        <label>Category<input required maxLength={80} value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
        <label>Severity<select value={editing.severity} onChange={(event) => setEditing({ ...editing, severity: event.target.value })}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
        <label className="rule-editor-wide">Trigger text<input required maxLength={500} value={editing.matchText} onChange={(event) => setEditing({ ...editing, matchText: event.target.value })} /></label>
        <label className="rule-editor-wide">Approved evidence<textarea required maxLength={10000} value={editing.evidenceText} onChange={(event) => setEditing({ ...editing, evidenceText: event.target.value })} /></label>
        <label className="rule-editor-wide">Explanation<textarea required maxLength={10000} value={editing.explanation} onChange={(event) => setEditing({ ...editing, explanation: event.target.value })} /></label>
        <label className="rule-editor-wide">Suggested wording<input required maxLength={500} value={editing.suggestion} onChange={(event) => setEditing({ ...editing, suggestion: event.target.value })} /></label>
      </div>
      {formError && <div className="workspace-alert" role="alert">{formError}</div>}
      <div className="rule-editor-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish source'}</button></div>
    </form>}
    <section className="panel source-list">{entries.map((rule) => <article className="source-row" key={rule.sourceId}><span className={`source-icon ${rule.severity.toLowerCase()}`}><BookOpenCheck size={18} /></span><div className="source-main"><div className="source-type">{rule.kind.replaceAll('_', ' ')} <span>·</span> {rule.sourceId}</div><strong>{rule.matchText}</strong><p>{rule.evidenceText}</p><small>Suggested wording: {rule.suggestion}</small></div><span className={`severity-label ${rule.severity.toLowerCase()}`}>{rule.severity}</span>{canManage && <div className="source-actions"><button className="icon-button small-icon" aria-label={`Edit ${rule.sourceId}`} onClick={() => { setFormError(''); setEditing({ ...rule }) }}><Pencil size={15} /></button><button className="icon-button small-icon" aria-label={`Archive ${rule.sourceId}`} disabled={busy} onClick={async () => { if (!window.confirm(`Archive ${rule.sourceId}? Existing findings will retain this source as evidence.`)) return; try { await archiveRule(rule.sourceId) } catch (issue) { setFormError(errorMessage(issue)) } }}><Archive size={15} /></button></div>}</article>)}{!entries.length && <div className="empty-state">No approved sources match “{search}”.</div>}</section>
    <div className="library-footnote"><LockKeyhole size={14} /><span>Only active, approved sources can be cited as evidence in a finding.</span></div>
  </>
}

function Analytics({ submissions }: { submissions: Submission[] }) {
  const findings = submissions.flatMap((submission) => submission.findings)
  const high = findings.filter((finding) => finding.severity === 'HIGH').length
  const evidenceCount = findings.filter((finding) => finding.evidence).length
  const evidenceRate = findings.length ? Math.round(evidenceCount / findings.length * 100) : 0
  const approved = submissions.filter((submission) => submission.status === 'APPROVED').length

  const submissionsWithClaims = submissions.filter((s) => s.claimVerification)
  const avgTruthScore = submissionsWithClaims.length
    ? Math.round(submissionsWithClaims.reduce((acc, s) => acc + (s.claimVerification?.truthScore ?? 0), 0) / submissionsWithClaims.length)
    : 100
  const totalVerifiedClaims = submissions.reduce((acc, s) => acc + (s.claimVerification?.verifiedCount ?? 0), 0)
  const totalContradictedClaims = submissions.reduce((acc, s) => acc + (s.claimVerification?.contradictedCount ?? 0), 0)

  const categoryCounts = useMemo(() => findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.category] = (counts[finding.category] ?? 0) + 1
    return counts
  }, {}), [findings])
  const maxCount = Math.max(1, ...Object.values(categoryCounts))

  return <>
    <PageHeading eyebrow="GOVERNANCE INSIGHTS" title="Analytics" description="A live summary of submissions, claim verifications, and findings in your workspace."
      action={submissions.length > 0 && (
        <div className="heading-actions">
          <button className="button button-secondary compact" onClick={() => exportSubmissionsCSV(submissions)}>
            <FileSpreadsheet size={14} /> Export All (CSV)
          </button>
          <button className="button button-secondary compact" onClick={() => exportSubmissionsJSON(submissions)}>
            <Download size={14} /> Export All (JSON)
          </button>
        </div>
      )}
    />
    <section className="metrics-grid analytics-metrics">
      <Metric icon={FileCheck2} label="Approved submissions" value={String(approved)} trendNote={`${submissions.length} total submissions`} accent="mint" />
      <Metric icon={Scale} label="Avg. Truth Score" value={`${avgTruthScore}%`} trendNote={`${totalVerifiedClaims} verified · ${totalContradictedClaims} conflicts`} accent={avgTruthScore >= 80 ? 'mint' : 'coral'} />
      <Metric icon={CircleAlert} label="High-severity findings" value={String(high)} trendNote={`${findings.length} findings total`} accent="coral" />
      <Metric icon={Gauge} label="Evidence coverage" value={`${evidenceRate}%`} trendNote={`${evidenceCount} findings with a source`} accent="blue" />
      <Metric icon={Clock3} label="Awaiting decision" value={String(submissions.filter((item) => ['IN_REVIEW', 'NEEDS_CHANGES'].includes(item.status)).length)} trendNote="current review queue" accent="gold" />
    </section>
    <article className="panel chart-panel"><div className="panel-heading"><div><h3>Findings by category</h3><p>{findings.length} findings across {submissions.length} submissions</p></div></div>
      <div className="live-category-list">{Object.entries(categoryCounts).map(([category, count]) => <div className="live-category-row" key={category}><span>{category}</span><div className="progress-track"><span style={{ width: `${count / maxCount * 100}%` }} /></div><strong>{count}</strong></div>)}{!findings.length && <div className="empty-state">Run an analysis to see findings here.</div>}</div>
    </article>
  </>
}
