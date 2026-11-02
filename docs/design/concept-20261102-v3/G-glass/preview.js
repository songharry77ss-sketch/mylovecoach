// A small local demonstration for the three existing reply-copy actions.
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const toast = document.querySelector('.toast');
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast.textContent = '답장을 복사했어요';
    } catch {
      toast.textContent = '브라우저에서 복사를 허용해 주세요';
    }
    toast.classList.add('shown');
    setTimeout(() => toast.classList.remove('shown'), 2000);
  });
});
