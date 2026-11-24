Name:       harbour-hstoreclient
Summary:    Harpoon Store client - browse and install SailfishOS apps
Version:    0.1.6
Release:    1
Group:      Applications/Internet
License:    MIT
URL:        https://harpoon-store.manisak.com
BuildArch:  noarch
Requires:   libsailfishapp-launcher
Source0:    harbour-hstoreclient-0.1.6.tar.gz
Source1:    harbour-hstoreclient.desktop

%description
Harpoon Store client: browse community Sailfish OS apps and install them
with Harpoon via a single tap. Sandboxing is disabled via the desktop key
so the app has direct network access.

%prep
cd $HOME/rpmbuild/SOURCES
mkdir harbour-hstoreclient-0.1.6
cp *.qml *.png harbour-hstoreclient.desktop harbour-hstoreclient-0.1.6/
tar czf harbour-hstoreclient-0.1.6.tar.gz harbour-hstoreclient-0.1.6
%setup -q -n harbour-hstoreclient-0.1.6

%build

%install
mkdir -p %{buildroot}%{_datadir}/%{name}/qml
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/86x86/apps
mkdir -p %{buildroot}%{_datadir}/%{name}/qml/pages
cp harbour-hstoreclient.qml %{buildroot}%{_datadir}/%{name}/qml/harbour-hstoreclient.qml
cp FirstPage.qml DetailPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/
cp harbour-hstoreclient.desktop %{buildroot}%{_datadir}/applications/harbour-hstoreclient.desktop
cp harbour-hstoreclient.png %{buildroot}%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png

%files
%defattr(-,root,root,-)
%{_datadir}/%{name}/qml/*.qml
%{_datadir}/%{name}/qml/pages/*.qml
%{_datadir}/applications/harbour-hstoreclient.desktop
%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png

%changelog
* Tue Nov 24 2026 manisak <manisak@users.noreply.github.com> 0.1.6-1
- Item-root QML (QQuickView compatible), sandbox disabled
