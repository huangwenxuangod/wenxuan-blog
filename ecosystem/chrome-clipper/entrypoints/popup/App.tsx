import { useState, useEffect } from 'react';
import { Settings, ArrowLeft, Check, AlertTriangle, Sparkles, Loader2, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { loadSettings, saveSettings } from '../../utils/settings';
import { clearDiagnosticLogs, getDiagnosticLogs, writeLog, type DiagnosticError } from '../../utils/logger';

type ViewState = 'clip' | 'settings' | 'progress' | 'success' | 'error';
type ProgressStep = 'extracting' | 'uploading' | 'creating';

interface Category {
  id: number;
  name: string;
  slug: string;
}

function App() {
  const [view, setView] = useState<ViewState>('clip');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');

  // Settings
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');

  // Progress
  const [progressStep, setProgressStep] = useState<ProgressStep>('extracting');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // Success / Error
  const [successData, setSuccessData] = useState<{
    slug: string;
    title: string;
    imageCount: number;
    status: 'draft' | 'published';
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [diagnosticError, setDiagnosticError] = useState<DiagnosticError | null>(null);

  const [toast, setToast] = useState('');

  // Show a temporary toast message
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // 1. Load settings on mount
  useEffect(() => {
    void loadSettings().then(({ apiUrl: url, apiToken: token }) => {
      setApiUrl(url);
      setApiToken(token);

      if (!url || !token) {
        setView('settings');
        return;
      }

      setView('clip');
      fetchCategories(url, token);
      fetchActiveTabTitle();
    });
  }, []);

  // 2. Listen for progress updates from background service worker
  useEffect(() => {
    const handleProgress = (msg: any) => {
      if (msg.action === 'progress') {
        setProgressStep(msg.step);
        setProgressCurrent(msg.current || 0);
        setProgressTotal(msg.total || 0);
      }
    };
    chrome.runtime.onMessage.addListener(handleProgress);
    return () => chrome.runtime.onMessage.removeListener(handleProgress);
  }, []);

  // Fetch active tab title
  const fetchActiveTabTitle = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.title) {
        setTitle(tab.title);
      }
    } catch (err) {
      void writeLog('warn', 'ACTIVE_TAB_TITLE_FAILED', { error: err });
    }
  };

  // Fetch categories from blog API
  const fetchCategories = async (url: string, token: string) => {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    try {
      const resp = await fetch(`${cleanUrl}/api/admin/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      if (json.categories) {
        setCategories(json.categories);
      }
    } catch (err) {
      void writeLog('warn', 'CATEGORY_FETCH_FAILED', {
        context: { url: cleanUrl },
        error: err,
      });
    }
  };

  // Save settings
  const handleSaveSettings = async () => {
    const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
    const cleanToken = apiToken.trim();

    if (!cleanUrl) {
      showToast('请输入 API URL');
      return;
    }
    if (!cleanToken) {
      showToast('请输入 API Token');
      return;
    }

    try {
      await saveSettings({ apiUrl: cleanUrl, apiToken: cleanToken });
      showToast('设置已保存');
      setApiUrl(cleanUrl);
      setApiToken(cleanToken);
      fetchCategories(cleanUrl, cleanToken);
      setTimeout(() => {
        setView('clip');
      }, 500);
    } catch {
      showToast('设置保存失败');
    }
  };

  // Trigger Clip Action
  const handleClip = async () => {
    if (!apiUrl || !apiToken) {
      setView('settings');
      showToast('请先配置 API 信息');
      return;
    }

    if (!title.trim()) {
      showToast('请填写文章标题');
      return;
    }

    setView('progress');
    setProgressStep('extracting');
    setProgressCurrent(0);
    setProgressTotal(0);
    setDiagnosticError(null);

    try {
      const response: any = await chrome.runtime.sendMessage({
        action: 'clip',
        title: title.trim(),
        category: category || undefined,
        status: status,
      });

      if (response && response.success) {
        setSuccessData({
          slug: response.slug,
          title: response.title,
          imageCount: response.imageCount,
          status: response.status === 'published' ? 'published' : 'draft',
        });
        setView('success');
      } else {
        setErrorMessage(response?.error || '剪藏失败');
        setDiagnosticError(response?.diagnostic || null);
        setView('error');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '发生未知错误');
      const diagnostic: DiagnosticError = {
        code: 'POPUP_MESSAGE_FAILED',
        phase: 'dispatching',
        message: err.message || '发生未知错误',
        errorId: await writeLog('error', 'POPUP_MESSAGE_FAILED', { error: err }),
        hint: '请重新加载扩展并刷新当前网页。',
      };
      setDiagnosticError(diagnostic);
      setView('error');
    }
  };

  const copyDiagnosticLogs = async () => {
    const logs = await getDiagnosticLogs();
    await navigator.clipboard.writeText(logs);
    showToast('诊断日志已复制');
  };

  const clearLogs = async () => {
    await clearDiagnosticLogs();
    showToast('诊断日志已清空');
  };

  const copyCurrentError = async () => {
    await navigator.clipboard.writeText(JSON.stringify({
      message: errorMessage,
      diagnostic: diagnosticError,
    }, null, 2));
    showToast('错误详情已复制');
  };

  const editorUrl = successData
    ? `${apiUrl}/editor?edit=${encodeURIComponent(successData.slug)}`
    : apiUrl;
  const secondaryUrl = successData?.status === 'published'
    ? `${apiUrl}/${encodeURIComponent(successData.slug)}`
    : `${apiUrl}/admin/posts`;

  return (
    <div className="relative flex flex-col h-[320px] w-[360px] bg-[#fcfbf7] select-none text-[#1a1a1a]">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] text-[#fcfbf7] px-3 py-1.5 rounded-md text-xs shadow-md transition-all duration-300">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#e5e5df] bg-[#f7f6f0]">
        <div className="flex items-center gap-2">
          {view === 'settings' && apiUrl && apiToken && (
            <button
              onClick={() => setView('clip')}
              className="p-1 rounded-md hover:bg-[#e5e5df] transition-colors cursor-pointer"
              title="返回"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="font-semibold text-sm tracking-wide flex items-center gap-1.5">
            <Sparkles size={14} className="text-[#8c8273]" />
            Wenxuan Blog Clipper
          </span>
        </div>

        {view !== 'progress' && view !== 'settings' && (
          <button
            onClick={() => setView('settings')}
            className="p-1 rounded-md hover:bg-[#e5e5df] transition-colors cursor-pointer text-[#555555] hover:text-[#1a1a1a]"
            title="设置"
          >
            <Settings size={16} />
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-3.5 flex flex-col">
        {/* VIEW: CLIP */}
        {view === 'clip' && (
          <div className="flex flex-col gap-4 flex-1 justify-between">
            <div className="flex flex-col gap-3">
              {/* Title Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-[#555555] uppercase tracking-wider">文章标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="正在获取标题..."
                  className="w-full px-3 py-1.5 rounded bg-[#fcfbf7] border border-[#e5e5df] focus:border-[#8c8273] focus:outline-none text-xs transition-colors"
                />
              </div>

              {/* Category & Status Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-[#555555] uppercase tracking-wider">文章分类</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[#fcfbf7] border border-[#e5e5df] focus:border-[#8c8273] focus:outline-none text-xs transition-colors cursor-pointer"
                  >
                    <option value="">未分类 (AI)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-[#555555] uppercase tracking-wider">发布状态</label>
                  <div className="grid grid-cols-2 p-0.5 rounded bg-[#f1f0ea] border border-[#e5e5df]">
                    <button
                      onClick={() => setStatus('draft')}
                      className={`py-1 text-center text-xs rounded transition-all cursor-pointer ${
                        status === 'draft'
                          ? 'bg-[#fcfbf7] text-[#1a1a1a] font-medium shadow-xs'
                          : 'text-[#555555] hover:text-[#1a1a1a]'
                      }`}
                    >
                      草稿
                    </button>
                    <button
                      onClick={() => setStatus('published')}
                      className={`py-1 text-center text-xs rounded transition-all cursor-pointer ${
                        status === 'published'
                          ? 'bg-[#fcfbf7] text-[#1a1a1a] font-medium shadow-xs'
                          : 'text-[#555555] hover:text-[#1a1a1a]'
                      }`}
                    >
                      发布
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleClip}
              className="w-full py-2.5 bg-[#1a1a1a] text-[#fcfbf7] hover:bg-[#333333] active:bg-black rounded text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Sparkles size={14} />
              一键剪藏到博客
            </button>
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {view === 'settings' && (
          <div className="flex flex-col gap-4 flex-1 justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-[#555555] uppercase tracking-wider">API URL</label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://your-domain.com"
                  className="w-full px-3 py-1.5 rounded bg-[#fcfbf7] border border-[#e5e5df] focus:border-[#8c8273] focus:outline-none text-xs transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-[#555555] uppercase tracking-wider">API Token</label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="在博客后台设置中生成"
                  className="w-full px-3 py-1.5 rounded bg-[#fcfbf7] border border-[#e5e5df] focus:border-[#8c8273] focus:outline-none text-xs transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              className="w-full py-2.5 bg-[#1a1a1a] text-[#fcfbf7] hover:bg-[#333333] rounded text-xs font-semibold tracking-wide transition-colors cursor-pointer"
            >
              保存设置
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyDiagnosticLogs}
                className="py-1.5 border border-[#e5e5df] text-[#555555] hover:text-[#1a1a1a] hover:bg-[#f1f0ea] rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
              >
                <Copy size={11} />
                复制诊断日志
              </button>
              <button
                onClick={clearLogs}
                className="py-1.5 border border-[#e5e5df] text-[#555555] hover:text-[#c62828] hover:bg-[#f1f0ea] rounded text-[11px] flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 size={11} />
                清空日志
              </button>
            </div>
          </div>
        )}

        {/* VIEW: PROGRESS */}
        {view === 'progress' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <Loader2 size={32} className="animate-spin text-[#8c8273]" />
            <div className="text-center flex flex-col gap-1">
              <p className="text-sm font-medium">
                {progressStep === 'extracting' && '正在提取页面内容...'}
                {progressStep === 'uploading' && '正在上传文章图片...'}
                {progressStep === 'creating' && '正在创建博客文章...'}
              </p>
              {progressStep === 'uploading' && progressTotal > 0 && (
                <p className="text-xs text-[#555555]">
                  已上传 {progressCurrent} / {progressTotal} 张图片
                </p>
              )}
            </div>
          </div>
        )}

        {/* VIEW: SUCCESS */}
        {view === 'success' && successData && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
            <div className="p-3 bg-[#e8f5e9] text-[#2e7d32] rounded-full">
              <Check size={28} />
            </div>
            <div className="flex flex-col gap-1 px-2">
              <p className="text-sm font-semibold truncate max-w-[280px]">{successData.title}</p>
              <p className="text-xs text-[#555555]">
                {successData.imageCount > 0
                  ? `成功上传并替换了 ${successData.imageCount} 张图片`
                  : '剪藏成功，内容已同步！'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-2">
              <a
                href={editorUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#f1f0ea] rounded text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ExternalLink size={12} />
                去后台编辑
              </a>
              <a
                href={secondaryUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 bg-[#1a1a1a] text-[#fcfbf7] hover:bg-[#333333] rounded text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ExternalLink size={12} />
                {successData.status === 'published' ? '查看文章' : '文章管理'}
              </a>
            </div>

            <button
              onClick={() => window.close()}
              className="text-xs text-[#555555] hover:text-[#1a1a1a] underline mt-2 cursor-pointer"
            >
              完成并关闭
            </button>
          </div>
        )}

        {/* VIEW: ERROR */}
        {view === 'error' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2.5 text-center">
            <div className="p-2 bg-[#ffebee] text-[#c62828] rounded-full">
              <AlertTriangle size={22} />
            </div>
            <div className="flex flex-col gap-1 px-2">
              <p className="text-sm font-semibold text-[#c62828]">剪藏失败</p>
              <p className="text-xs text-[#555555] max-h-[48px] overflow-y-auto max-w-[310px] leading-relaxed">
                {errorMessage}
              </p>
              {diagnosticError && (
                <div className="text-[10px] leading-4 text-[#777]">
                  <div>{diagnosticError.phase} · {diagnosticError.code}</div>
                  <div>ID: {diagnosticError.errorId.slice(0, 20)}</div>
                  {diagnosticError.requestId && <div>Request: {diagnosticError.requestId}</div>}
                  {diagnosticError.hint && <div>{diagnosticError.hint}</div>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={copyCurrentError}
                className="py-2 border border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#f1f0ea] rounded text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
              >
                <Copy size={12} />
                复制错误
              </button>
              <button
                onClick={() => setView('clip')}
                className="py-2 bg-[#1a1a1a] text-[#fcfbf7] hover:bg-[#333333] rounded text-xs font-semibold tracking-wide transition-colors cursor-pointer"
              >
                重新尝试
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
