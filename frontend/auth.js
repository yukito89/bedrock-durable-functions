// 簡易認証（社内検証用）
const CORRECT_PASSWORD = 'sample';

if (sessionStorage.getItem('authenticated') !== 'true') {
    let password = null;
    while (password !== CORRECT_PASSWORD) {
        password = prompt('パスワードを入力してください:');
        if (password !== CORRECT_PASSWORD) {
            alert('パスワードが違います');
        }
    }
    sessionStorage.setItem('authenticated', 'true');
}