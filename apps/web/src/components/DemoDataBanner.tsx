type DemoDataBannerProps = {
  visible?: boolean;
};

export const DemoDataBanner = ({ visible }: DemoDataBannerProps) => {
  const shouldShow = visible ?? false;

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="demo-data-banner" role="status">
      当前使用 seed 演示数据
    </div>
  );
};
