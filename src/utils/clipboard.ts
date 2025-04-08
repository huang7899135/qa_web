
import { ElMessageBox } from 'element-plus';
import { ElMessage } from 'element-plus';
/**
 * 增强的剪贴板复制函数 - 提高在各浏览器中的兼容性
 * @param content 要复制的内容
 * @returns Promise<boolean> 复制是否成功
 */
export async function copyToClipboard(content: string): Promise<boolean> {
  // 首先尝试使用现代 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(content);
      ElMessage.success('已复制到剪贴板！');
      return true;
    } catch (err) {
      console.warn('Clipboard API 失败，尝试备用方法', err);
      // 如果失败，继续尝试备用方法
    }
  }
  
  // 备用方法 1: 使用 document.execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    
    // 样式设置使元素在屏幕外但可以被选择
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    
    // 保存当前选择范围
    const selection = document.getSelection();
    const selectedRange = selection && selection.rangeCount > 0 
      ? selection.getRangeAt(0) 
      : null;
    
    textArea.focus();
    textArea.select();
    
    // 执行复制命令
    const successful = document.execCommand('copy');
    
    // 清理
    document.body.removeChild(textArea);
    
    // 恢复先前的选择
    if (selection && selectedRange) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
    
    if (successful) {
      ElMessage.success('已复制到剪贴板！');
      return true;
    }
  } catch (err) {
    console.warn('execCommand 复制方法失败', err);
  }
  
  // 备用方法 2: 使用新的 ClipboardItem API (适用于更多类型的数据)
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([content], { type: 'text/plain' })
      });
      await navigator.clipboard.write([clipboardItem]);
      ElMessage.success('已复制到剪贴板！');
      return true;
    } catch (err) {
      console.warn('ClipboardItem API 失败', err);
    }
  }
  
  // 如果所有方法都失败，提示用户手动复制
  promptManualCopy(content);
  return false;
}

/**
 * 提示用户手动复制内容
 * 当自动复制失败时的最后备选方案
 */
function promptManualCopy(content: string): void {
  // 创建一个模态框或提示，显示需要复制的内容
  ElMessage({
    message: '自动复制失败，请手动复制以下内容',
    type: 'info',
    duration: 5000,
    showClose: true
  });
  
  // 此处可以集成您的UI框架的对话框组件，显示内容供用户手动复制
  // 例如使用 Element Plus 的 MessageBox
  // 以下是示例代码，实际实现需要根据您的UI框架调整
  

  
  ElMessageBox.alert(content, '请手动复制此内容', {
    confirmButtonText: '已复制',
    callback: () => {
      ElMessage({
        type: 'success',
        message: '感谢！'
      });
    }
  });
}