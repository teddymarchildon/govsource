import styles from './LoadingIndicator.module.css';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  inline?: boolean;
  label?: string;
}

export default function LoadingIndicator({ size = 'medium', inline = false, label = 'Loading…' }: LoadingIndicatorProps) {
  return (
    <span role="status" className={inline ? 'inline-flex shrink-0 items-center align-middle' : 'flex items-center justify-center py-4'}>
      <span aria-hidden="true" className={`${styles.flow} ${styles[size]}`}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
