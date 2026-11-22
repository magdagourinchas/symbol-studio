'use strict';
// Runs before styles load so embed-only UI never flashes on screen.
const params=new URLSearchParams(location.search);
if(params.get('embed')==='1'){
  document.documentElement.classList.add('embed-mode');
  document.title='Symbol editor';
}
