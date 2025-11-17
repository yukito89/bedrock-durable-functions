// 簡易認証（社内検証用）
const CORRECT_PASSWORD = 'sample';

if (sessionStorage.getItem('authenticated') !== 'true') {
    let password = null;
    while (password !== CORRECT_PASSWORD) {
        password = prompt('パスワードを入力してください:');
        if (password === null) {
            alert('認証がキャンセルされました');
            window.location.href = 'about:blank';
            break;
        }
        if (password !== CORRECT_PASSWORD) {
            alert('パスワードが違います');
        }
    }
    if (password === CORRECT_PASSWORD) {
        sessionStorage.setItem('authenticated', 'true');
    }
}