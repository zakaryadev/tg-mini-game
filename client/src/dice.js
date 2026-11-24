// 3D kub zar. Natijani server beradi; bu yerda faqat animatsiya.
const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function createDie(size = 48) {
  const root = document.createElement('span');
  root.className = 'dwrap';
  root.style.setProperty('--s', size + 'px');
  let faces = '';
  for (let n = 1; n <= 6; n++) {
    let pips = '';
    for (let i = 0; i < 9; i++) pips += `<i class="pip ${FACES[n].includes(i) ? 'on' : ''}"></i>`;
    faces += `<span class="face f${n}">${pips}</span>`;
  }
  root.innerHTML = `<span class="scene"><span class="tilt"><span class="cube s1">${faces}</span></span></span><span class="badge"></span>`;
  const scene = root.querySelector('.scene');
  const cube = root.querySelector('.cube');
  const badge = root.querySelector('.badge');
  let n = 0;
  const par = () => (n === 0 ? '' : n % 2 ? 'pa' : 'pb');
  return {
    el: root,
    /** animatsiya bilan value yoqqa tushadi */
    roll(value) {
      n++;
      scene.className = 'scene ' + par();
      cube.className = `cube s${value} ${par()}`;
      badge.className = 'badge ' + par();
      badge.textContent = value;
    },
    /** animatsiyasiz (qayta ulanishda) */
    set(value) {
      cube.style.transition = 'none';
      cube.className = `cube s${value} ${par()}`;
      void cube.offsetWidth;
      cube.style.transition = '';
      badge.className = 'badge';
      badge.textContent = '';
    }
  };
}
