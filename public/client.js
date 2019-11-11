var username = 'The Guide'
var socket = io('https://hitchhiker.glitch.me/')
var rm = "";
socket.on('connect', function(){
  rm = prompt("What room would you like to create?")
  if(rm.length > 0){socket.emit('joinRoom', rm)};
})
socket.on('newMsg', function(data){
	addMsg(data.username, data.msg)
})
socket.on('joinRoom', function(data){
	addMsg(data.username, data.msg)
})
$('input').focus()

$('#changeURLDiv button').click(newPage)
$('#changeTextDiv button').click(changeText)
$('#sendMsgDiv button').click(sendMsg)

$(document).keyup(function(e){
	if(e.key == 'Enter'){
		$(':focus').parent().find('button').trigger('click')
    //sendMsg()
	}
})
function sendMsg(){
	var msg = $('#sendMsgDiv input').val();
	if(msg.length > 0){
		socket.emit('newMsg', {username:username, msg:msg});
		addMsg(username, msg);
		$('#sendMsgDiv input').val('')
	}
}
function addMsg(user, msg){
	$('#messages').append("<p><strong>"+user+": </strong>"+msg+"</p>")
}
function addSysMsg(msg){
  $('#messages').append("<p>"+msg+"</p>")
}
function newPage(){
  var newURL = $('#changeURLDiv input').val()
  if(newURL.indexOf('http') < 0){newURL = "https://" + newURL}
  if(isURL(newURL)){
	  $('#messages').append("<p>Going to <em>"+newURL+"</em></p>")
    $('iframe').attr('src',newURL)
    socket.emit('newPage', {url:newURL});
  }
  else {
    addSysMsg("<span style='color:red'>invalid URL</url>")
  }
  $('#changeURLDiv input').val('')
}
function changeText(){
  var msg = $('#changeTextDiv input').val();
	if(msg.length > 0){
		socket.emit('changeText', {newText:msg});
	} 
  $('#changeTextDiv input').val('')
}

function isURL(str) {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
  if(!regex .test(str)) {
    return false; 
  } else {
    return true;
  }
}