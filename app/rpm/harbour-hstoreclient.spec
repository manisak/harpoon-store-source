Name:       harbour-hstoreclient
Summary:    Harpoon Store client - browse and install SailfishOS apps
Version:    0.1.3
Release:    1
Group:      Applications/Internet
License:    MIT
URL:        https://harpoon-store.manisak.com
BuildArch:  noarch
Requires:   libsailfishapp-launcher
Source0:    harbour-hstoreclient-0.1.3.tar.gz

%description
Harpoon Store client: browse community Sailfish OS apps and install
them with Harpoon via a single tap.

%prep
cd $HOME/rpmbuild/SOURCES
mkdir harbour-hstoreclient-0.1.3
cp *.qml *.png harbour-hstoreclient.desktop harbour-hstoreclient-0.1.3/
tar czf harbour-hstoreclient-0.1.3.tar.gz harbour-hstoreclient-0.1.3
%setup -q -n harbour-hstoreclient-0.1.3

%build

%install
mkdir -p %{buildroot}%{_datadir}/%{name}/qml
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/86x86/apps
cp *.qml %{buildroot}%{_datadir}/%{name}/qml/
cp harbour-hstoreclient.desktop %{buildroot}%{_datadir}/applications/harbour-hstoreclient.desktop
cp harbour-hstoreclient.png %{buildroot}%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png

%files
%defattr(-,root,root,-)
%{_datadir}/%{name}/qml/*.qml
%{_datadir}/applications/harbour-hstoreclient.desktop
%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png
