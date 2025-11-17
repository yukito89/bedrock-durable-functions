// サポート画面 共通チェック JavaScript


// ━━━━━━━━━━━━━━━━━━━━━━
//	Cookieキー
// ━━━━━━━━━━━━━━━━━━━━━━
var cnsHisUse	= 'M_HisUse';		// 履歴の使用有無	1：利用あり
var cnsHisList	= 'M_HisList';		// 履歴一覧			「,」区切り。ポートは「:」区切り
var cnsLinkHost	= 'M_LinkHost';		// ページ間のホスト名等連携
var cnsInBack	= 'M_InBack';		// 入力復元用



// ━━━━━━━━━━━━━━━━━━━━━━
//	各入力画面オープン時
// ━━━━━━━━━━━━━━━━━━━━━━
function openIniSet() {

	// 実行中POP 非表示
	jikkoMsgOff();

	// 実行中POP の内容編集（初期編集）
	jikkoMsgPut();

	// 入力項目の初期設定
	var wHostObj = document.getElementById(keyHostName);
	if((wHostObj.value == '')||(wHostObj.value == 'http://')){

		// 前画面からホスト名などがリンクされている場合は設定
		if(tmGetCookie(cnsLinkHost) != ''){
			hostDefSet(tmGetCookie(cnsLinkHost));
		}

		// 結果画面からの戻りの場合
		else if(tmGetCookie(cnsInBack) != ''){

			// Coolie内の形式	id,value;id,value;
			var wIdVakue = tmGetCookie(cnsInBack).split(";");

			// 型に合わせて戻し入れる
			for (var i = 0; i < wIdVakue.length; i++) {
				if(wIdVakue[i] != ''){

					var wIdVakue2 = wIdVakue[i].split(",");

					if(document.getElementById(wIdVakue2[0])){
						var wObj = document.getElementById(wIdVakue2[0]);

						switch (wObj.tagName.toLowerCase()){
						case 'select':
							for(var j=0; j<wObj.length; j++){
								if(wObj.options[j].value == wIdVakue2[1]){wObj.options[j].selected = true;}
							}
							break;

						case 'input':
							if(wObj.type.toLowerCase() == 'checkbox'){
								if(wObj.value == wIdVakue2[1])	{wObj.checked = true;}
								else							{wObj.checked = false;}
							}
							if(wObj.type.toLowerCase() == 'radio'){
								for(var k=0; k<wObj.length; k++){
									if(wObj[k].value == wIdVakue2[1]){wObj[k].checked = true;}
								}
							}
							else{
								wObj.value = wIdVakue2[1]
							}
							break;

						case 'textarea':
							wObj.value = wIdVakue2[1]
							break;
						}
					}
				}
			}
		}
	}

	// 遷移用一時Cookieクリア
	tmClearCookie(cnsLinkHost);
	tmClearCookie(cnsInBack);


	wHostObj.focus();
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	入力ホスト、IPチェック
// ━━━━━━━━━━━━━━━━━━━━━━
function chkInServer(argID,argErrId) {

	var chkObj	= document.getElementById(argID);
	var msgObj;
	var chkMsg	= '';
	var chkErrCnt	= 0;

	if(argErrId == ''){
		msgObj	= document.getElementById('errMsg');
	}else{
		msgObj	= document.getElementById(argErrId);
	}

	chkObj.value	= chkObj.value.trim();

	// エラーメッセージ初期化
	msgObj.style.display	= 'none';

	// エラーチェック
	if(chkObj.value==''){
		chkMsg=chkMsg+"【エラー】ホスト名またはIPアドレスを指定してください。<br>";
		chkErrCnt++;
	}

	// 先頭不要文字削除
	if(chkObj.value.substr(0,7)=="http://"){chkObj.value=chkObj.value.substr(7);}
	if(chkObj.value.substr(0,8)=="https://"){chkObj.value=chkObj.value.substr(8);}
	if(chkObj.value.substr(0,6)=="ftp://"){chkObj.value=chkObj.value.substr(6);}

	if(chkObj.value.match(/[<>\"\{\}\|\\\^\[\]`#;\?&=\+\$,\'\(\)\:\/\%\@]+/)){
		chkMsg=chkMsg+"【エラー】使用不能文字が含まれています。<br>";
		chkErrCnt++;
	}
	if(chkObj.value.length > 100){
		chkMsg=chkMsg+"【エラー】ホスト名またはIPアドレスに指定できるのは100文字までです。<br>";
		chkErrCnt++;
	}

	if(chkObj.value.match(/[.]/)){
	}else{
		chkMsg=chkMsg+"【エラー】入力形式を確認してください。<br>";
		chkErrCnt++;
	}

	// エラー編集
	if(chkErrCnt>0){
		msgObj.innerHTML	= chkMsg;
		msgObj.style.display	= '';
		chkObj.focus();
		return false;
	}

	return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	確認チェックボックス　チェック
// ━━━━━━━━━━━━━━━━━━━━━━
function chkKakunin(argID,argErrId) {

	var chkObj	= document.getElementById(argID);
	var msgObj;
	var chkMsg	= '';
	var chkErrCnt	= 0;

	if(argErrId == ''){
		msgObj	= document.getElementById('errMsg');
	}else{
		msgObj	= document.getElementById(argErrId);
	}

	// エラーメッセージ初期化
	msgObj.style.display	= 'none';

	// エラーチェック
	if(!chkObj.checked){
		chkMsg=chkMsg+"【エラー】「ご注意・制約事項」をご確認の上、チェックしてください。<br>";
		chkErrCnt++;
	}

	// エラー編集
	if(chkErrCnt>0){
		msgObj.innerHTML	= chkMsg;
		msgObj.style.display	= '';
		chkObj.focus();
		return false;
	}

	return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	入力URLチェック
// ━━━━━━━━━━━━━━━━━━━━━━
function chkInUrl(argID,argErrId) {

	var chkObj	= document.getElementById(argID);
	var msgObj;
	var chkMsg	= '';
	var chkErrCnt	= 0;

	if(argErrId == ''){
		msgObj	= document.getElementById('errMsg');
	}else{
		msgObj	= document.getElementById(argErrId);
	}

	chkObj.value	= chkObj.value.trim();

	// エラーメッセージ初期化
	msgObj.style.display	= 'none';

	// エラーチェック

	// http://を一旦消す
	if(chkObj.value.substr(0,7)=="http://"){chkObj.value=chkObj.value.substr(7);}

	if(chkObj.value==''){
		chkMsg=chkMsg+"【エラー】URLを指定してください。<br>";
		chkErrCnt++;
	}

	if(chkObj.value.match(/[<>\"\{\}\|\\\^\[\]`#;\?&=\+\$,\'\(\)]+/)){
		chkMsg=chkMsg+"【エラー】使用不能文字が含まれています。<br>";
		chkErrCnt++;
	}
	if(chkObj.value.length > 200){
		chkMsg=chkMsg+"【エラー】URLに指定できるのは200文字までです。<br>";
		chkErrCnt++;
	}

	// http://の付加
	if(chkObj.value.substr(0,8)=="https://"){
		chkMsg=chkMsg+"【エラー】httpsは「ホームページ表示チェック」をご利用ください。<br>";
		chkErrCnt++;
	}else{
		if(chkObj.value.substr(0,7)!="http://"){chkObj.value="http://"+chkObj.value;}
	}

	// エラー編集
	if(chkErrCnt>0){
		msgObj.innerHTML	= chkMsg;
		msgObj.style.display	= '';
		chkObj.focus();
		return false;
	}

	return true;
}


// ━━━━━━━━━━━━━━━━━━━━━━
//	入力ポート番号チェック
// ━━━━━━━━━━━━━━━━━━━━━━
function chkInPort(argID,argErrId) {

	var chkObj	= document.getElementById(argID);
	var msgObj;
	var chkMsg	= '';
	var chkErrCnt	= 0;

	if(argErrId == ''){
		msgObj	= document.getElementById('errMsg');
	}else{
		msgObj	= document.getElementById(argErrId);
	}

	chkObj.value	= chkObj.value.trim();

	// エラーメッセージ初期化
	msgObj.style.display	= 'none';


	// エラーチェック
	if(chkObj.value==''){
		chkMsg=chkMsg+"【エラー】ポート番号を入力してください。<br>";
		chkErrCnt++;
	}else{
		if(chkObj.value.match(/[^0-9]/g)){
			chkMsg=chkMsg+"【エラー】ポート番号を数字で入力してください。<br>";
			chkErrCnt++;
		}else{
			if(parseInt(chkObj.value) > 65535){
				chkMsg=chkMsg+"【エラー】ポート番号は65535以下で入力してください。<br>";
				chkErrCnt++;
			}
		}
	}

	// エラー編集
	if(chkErrCnt>0){
		msgObj.innerHTML	= chkMsg;
		msgObj.style.display	= '';
		chkObj.focus();
		return false;
	}

	return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	実行中 (submit)
// ━━━━━━━━━━━━━━━━━━━━━━
function goSubmit(argName){


	// 実行中表示
	jikkoMsgON();

	// 実行
	document.f1.method	= "POST";
	document.f1.target	= "_self";
	document.f1.action	= argName+".cgi";
	document.f1.submit();

}

// ━━━━━━━━━━━━━━━━━━━━━━
//	実行中POP 非表示
// ━━━━━━━━━━━━━━━━━━━━━━
function jikkoMsgOff(){
	document.getElementById('jikkochu').style.display = 'none';
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	実行中POP 表示
// ━━━━━━━━━━━━━━━━━━━━━━
function jikkoMsgON(){
	var objJikko = document.getElementById('jikkochu');

	var wLeft = Math.floor((document.documentElement.clientWidth - 290) / 2) + (document.body.scrollLeft || document.documentElement.scrollLeft);
	var wTop  = Math.floor((document.documentElement.clientHeight - 100) / 2) + (document.body.scrollTop  || document.documentElement.scrollTop);

	if(wLeft < 0){wLeft=0;}
	if(wTop  < 0){wTop=0;}

	objJikko.style.left = wLeft+'px';
	objJikko.style.top = wTop+'px';

	objJikko.style.display = '';
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	実行中 POP編集
// ━━━━━━━━━━━━━━━━━━━━━━
function jikkoMsgPut(){
	document.getElementById('jikkochu').innerHTML = '<div style="max-width: 300px;margin: 5px auto;border: 2px solid #9999ff;padding: 10px;background-color: #ffffff;box-shadow: 7px 7px #ccccff;color: #3333cc;font-weight: bold;text-align: center;">'
	+ '<img src="https://sozai.cman.jp/imgSV/jikko1.gif" width="220" height="19" border="0">'
	+ '<div>実行中です。しばらくお待ちください。<br>（30秒程度かかる場合もあります）</div>'
	+ '</div>';
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	履歴リストOPEN
// ━━━━━━━━━━━━━━━━━━━━━━
function hisListOpen(){

	// 履歴の使用許可なしは、許可画面へ
	if(tmGetCookie(cnsHisUse) != '1'){
		location.href = "cookie_set.html";
		return true;
	}

	for (var i = 0; i < 8; i++) {
		document.getElementById('hisTd'+i).innerHTML = '-';
	}

	// Cookieから履歴取得
	var wCookieStr = tmGetCookie(cnsHisList);
	var wCookieList = wCookieStr.split(",");
	for (var i = 0; i < wCookieList.length; i++) {
		if(wCookieList[i] != ''){
			document.getElementById('hisTd'+i).innerHTML = wCookieList[i];
		}
	}


	var objHisList = document.getElementById('hisList');
	objHisList.style.left = Math.floor(GetLeft(document.getElementById('hisGaid')))+"px";
	objHisList.style.top = Math.floor(GetTop(document.getElementById('hisGaid')))+"px";
	objHisList.style.display = '';

	return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	履歴リストCLOSE
// ━━━━━━━━━━━━━━━━━━━━━━
function hisListClose(){
	var objHisList = document.getElementById('hisList').style.display = 'none';
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	履歴リスト保存
// ━━━━━━━━━━━━━━━━━━━━━━
function hisCookieSet(){

	// 履歴の使用許可なしは、履歴を保存しない
	if(tmGetCookie(cnsHisUse) != '1'){
		return true;
	}


	// 今回保存するホスト名等を組み立てる
	var wNowSetHost = document.getElementById(keyHostName).value.trim();
	if(keyPortName != ''){
		wNowSetHost = wNowSetHost + ':' + document.getElementById(keyPortName).value.trim();
	}


	// 今回のホスト名をトップに保存	
	var wSaveCookieStr = wNowSetHost;


	// Cookieから履歴取得
	var wCookieStr = tmGetCookie(cnsHisList);
	var wCookieList = wCookieStr.split(",");

	var wSetCnt = 0;
	for (var i = 0; i < wCookieList.length; i++) {
		if(wCookieList[i] != ''){

			// 今回と同じ履歴を除いて順に結合
			if(wCookieList[i] != wNowSetHost){
				wSaveCookieStr = wSaveCookieStr + ',' + wCookieList[i].trim();
				wSetCnt++;
				if(wSetCnt >= 7){break;}
			}
		}
	}

	// 履歴を48時間Cookieに保存
	tmSetCookie(cnsHisList, wSaveCookieStr, 48);

	// 履歴使用設定の保存を60日間延長
	tmSetCookie(cnsHisUse, '1', 1440);

}

// ━━━━━━━━━━━━━━━━━━━━━━
//	選択されたヒストリを設定
// ━━━━━━━━━━━━━━━━━━━━━━
function hisSet(argRow){

	var wSetStr = '';

	// 履歴なし箇所
	if(document.getElementById('hisTd'+argRow).innerHTML == '-'){return false;}

	// 履歴クリア
	if(argRow == '98'){
		tmClearCookie(cnsHisList);
		hisListClose();
		return false;
	}

	// 履歴の説明と設定
	if(argRow == '99'){
		location.href = "cookie_set.html";
		return true;
	}

	// 選択された履歴
	var wSelStr = document.getElementById('hisTd'+argRow).innerHTML;

	// 選択された履歴を設定
	hostDefSet(wSelStr);

	// 履歴を閉じる
	hisListClose();

	document.getElementById(keyHostName).focus();
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	指定の文字より画面にあった初期設定を行う
// ━━━━━━━━━━━━━━━━━━━━━━
function hostDefSet(argString){

	// 「http://」を消す
	if(argString.substr(0,7).toLowerCase() == 'http://') {argString = argString.substr(7);}
	if(argString.substr(0,8).toLowerCase() == 'https://'){argString = argString.substr(8);}

	// FQDNとポート番号を取り出す
	var wSplit1 = argString.split("/");
	var wSplit2 = wSplit1[0].split("<");
	var wSplit3 = wSplit2[0].split(":");	// [0]:FQDN [1]:PORT
	var wFQDN   = wSplit3[0].trim();
	var wPORT   = '';
	if(wSplit3.length > 1){wPORT = wSplit3[1].trim();}


	// 属性に合わせて設定する
	switch (keyHostKbn){
	case 'URL':
		wSetStr = 'http://' + argString;
		break;
	case 'SSL':
		wSetStr = 'https://' + argString;
		break;
	case 'HOST':
		wSetStr = wFQDN;
		break;
	case 'DOMAIN':
		wSetStr = wFQDN;
		var wSplit3 = wFQDN.split('.');

		// www.cman.co.jp  → cman.co.jp
		if(wFQDN.match(/(\.ac\.jp|\.co\.jp|\.go\.jp|\.or\.jp|\.ad\.jp|\.ne\.jp|\.gr\.jp|\.ed\.jp|\.lg\.jp)$/i)){
			if(wSplit3.length >= 3){
				wSetStr = wSplit3[wSplit3.length - 3] + '.' + wSplit3[wSplit3.length - 2] + '.' + wSplit3[wSplit3.length - 1];
			}
		}
		else{
			if(wSplit3.length >= 2){
				wSetStr = wSplit3[wSplit3.length - 2] + '.' + wSplit3[wSplit3.length - 1];
			}
		}
		break;
	}

	// 設定
	document.getElementById(keyHostName).value = wSetStr;

	if((keyPortName != '')&&(wPORT != '')){
		document.getElementById(keyPortName).value = wPORT;
	}

	return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	現在のIPアドレスを設定
// ━━━━━━━━━━━━━━━━━━━━━━
function autoSetIp(){
	document.getElementById(keyHostName).value = (keyHostKbn == 'URL' ? 'http://' : '') + document.getElementById('sysNowIp').value;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	次ページ表示（IP,ホストを引き渡す）
// ━━━━━━━━━━━━━━━━━━━━━━
function NextPage(argPage){

	var $objForm = document.flink;

	// リンクのホストを一時的にCookie保存(10秒)
	tmSetCookie(cnsLinkHost, document.getElementById(keyHostName).value.trim(), 0.1 );

	location.href = argPage+".html";
}


// ━━━━━━━━━━━━━━━━━━━━━━
//	戻る
// ━━━━━━━━━━━━━━━━━━━━━━
function backBt(){

	// リンクのホストを一時的にCookie保存(10秒)
	if(document.getElementById('inAll')){
		tmSetCookie(cnsInBack, document.getElementById('inAll').value.trim(), 0.1 );
	}

	window.history.back(-1);
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	マウスイン
// ━━━━━━━━━━━━━━━━━━━━━━
function mIn(argRow){
	if(document.getElementById('hisTd'+argRow).innerHTML != '-'){
		document.getElementById('hisTr'+argRow).className	= "tr2";
	}
}
// ━━━━━━━━━━━━━━━━━━━━━━
//	マウスアウト
// ━━━━━━━━━━━━━━━━━━━━━━
function mOut(argRow){
	document.getElementById('hisTr'+argRow).className	= "tr1";
}


// ━━━━━━━━━━━━━━━━━━━━━━
//	StringクラスにTrimメソッドの追加
//		trimStr = str.trim();
// ━━━━━━━━━━━━━━━━━━━━━━
String.prototype.trim = function() {
	var wStr="";
	wStr=this.replace(/^[ ]+|[ ]+$/g, '');
	wStr=wStr.replace(/^[　]+|[　]+$/g, '');
	return wStr;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	画面に表示中の位置を取得
// ━━━━━━━━━━━━━━━━━━━━━━
function nowWinPos()
{
	var wWinTop		= 0;
	var wWinBottom	= 0;
	var wWinLeft	= 0;
	var wWinRight	= 0;

	// 現在画面に表示されている上下左右(px)
	if		(document.body.scrollTop	!== 'undefined'){wWinTop	= document.body.scrollTop;}
	else if	(window.pageYOffset			!== 'undefined'){wWinTop	= window.pageYOffset;}

	if		(document.body.clientHeight	!== 'undefined'){wWinBottom	= wWinTop + document.body.clientHeight;}
	else if	(innerWidth					!== 'undefined'){wWinBottom	= wWinTop + innerWidth;}

	if		(document.body.scrollLeft	!== 'undefined'){wWinLeft	= document.body.scrollLeft;}
	else if	(window.pageXOffset			!== 'undefined'){wWinLeft	= window.pageXOffset;}

	if		(document.body.clientWidth	!== 'undefined'){wWinRight	= wWinLeft + document.body.clientWidth;}
	else if	(innerWidth					!== 'undefined'){wWinRight	= wWinLeft + innerWidth;}

	return {top: wWinTop, right: wWinRight, bottom: wWinBottom, left: wWinLeft};

}
// ━━━━━━━━━━━━━━━━━━━━━━
//	機　能： オブジェクトの左位置を取得
//	引　数： オブジェクト
//	戻り値： 左からのピクセル数
// ━━━━━━━━━━━━━━━━━━━━━━
function GetLeft(oj){
	var px = 0;
	while(oj){
		px += oj.offsetLeft;
		oj = oj.offsetParent;
	}
	return px;
}

// ━━━━━━━━━━━━━━━━━━━━━━
//	機　能： オブジェクトの上位置を取得
//	引　数： オブジェクト
//	戻り値： 上からのピクセル数
// ━━━━━━━━━━━━━━━━━━━━━━
function GetTop(oj){
	var px = 0;
	while(oj){
		px += oj.offsetTop;
		oj = oj.offsetParent;
	}
	return px;
}
